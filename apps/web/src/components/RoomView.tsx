"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { InviteQrPanel } from "@/components/InviteQrPanel";
import type {
  ChatMessage,
  LlmCatalogEntry,
  LlmRoomConfig,
  MjHostReclaimChoice,
  Player,
  ProceduralMap,
  Room,
  SceneState,
} from "@rpg-cr/shared";
import {
  hostRecapSessionStorageKey,
  pickHostMjPromptType,
} from "@rpg-cr/shared";
import {
  getLlmCatalog,
  getRoom,
  introducePlayer,
  patchPlayerLocale,
  saveLlmConfig,
  setGodMode as patchGodMode,
  snapshotCampaign,
  testLlmConfig,
  promptMj,
  fetchMentionSuggestions,
  type MjPromptType,
  type MjStatusSnapshot,
} from "@/lib/api";
import { appendChatMessage } from "@/lib/chat-messages";
import { vibrateForWsMessage } from "@/lib/message-vibrate";
import { shouldShowAlertsPrompt } from "@/lib/message-alerts-prompt";
import { notifyForWsMessage } from "@/lib/message-notifications";
import { MessageAlertsPrompt } from "@/components/MessageAlertsPrompt";
import {
  useRoomWebSocket,
  type RoomWsEvent,
} from "@/hooks/use-room-websocket";
import { loadSession, clearSession, type Session } from "@/lib/session";
import { rememberGrain, touchGrain } from "@/lib/grains";
import {
  loadAdminPanel,
  saveAdminPanel,
  subscribeAdminPanel,
} from "@/lib/god-mode-ui";
import { GodModeSwitch } from "@/components/GodModeSwitch";
import { AdminLlmForm } from "@/components/AdminLlmForm";
import { LocaleSelector } from "@/components/LocaleSelector";
import { ChatMessageRow } from "@/components/ChatMessageRow";
import {
  filterMessagesForViewer,
  shouldShowErrorToPlayer,
} from "@/lib/message-visibility";
import {
  loadLocaleBackup,
  resolveViewerLocale,
  saveLocaleBackup,
} from "@/lib/locale-prefs";
import {
  DEFAULT_LOCALE,
  canHumanParticipateInChat,
  type MentionCandidate,
} from "@rpg-cr/shared";
import { ChatMentionInput } from "@/components/ChatMentionInput";
import {
  PlayerCompanionList,
} from "@/components/PlayerCompanionList";
import { GraineReader } from "@/components/GraineReader";
import { CharacterCreationWizard } from "@/components/CharacterCreationWizard";
import { HostSetupWizard } from "@/components/HostSetupWizard";
import { HeroAssistantPanel } from "@/components/HeroAssistantPanel";
import { RoomDockNav } from "@/components/RoomDockNav";
import {
  loadRoomSideTab,
  saveRoomSideTab,
  type RoomSideTab,
} from "@/lib/room-side-nav";
import {
  isHostLlmSetupComplete,
  markHostLlmSetupComplete,
} from "@/lib/host-llm-setup";
import { useAutoHostTunnel } from "@/hooks/use-auto-host-tunnel";
import { isVpsLmStudioHostMode } from "@/lib/lmstudio-tunnel";
import { CharacterSheetPanel } from "@/components/CharacterSheetPanel";
import { NarrativeCanonPanel } from "@/components/NarrativeCanonPanel";
import { SceneIndicator } from "@/components/SceneIndicator";
import { ScribIndicator } from "@/components/ScribIndicator";

interface Props {
  code: string;
}

export type SpeechMode = "say" | "action";

const CHAT_SCROLL_THRESHOLD_PX = 80;

function scrollChatLogToBottom(
  el: HTMLDivElement,
  behavior: ScrollBehavior = "smooth"
): void {
  const top = Math.max(0, el.scrollHeight - el.clientHeight);
  if (behavior === "instant") {
    el.scrollTop = top;
    return;
  }
  try {
    el.scrollTo({ top, behavior });
  } catch {
    el.scrollTop = top;
  }
}
const CHAT_EXPANDED_STORAGE_PREFIX = "rpg-cr-chat-expanded:";
const MJ_THINKING_IA_HINT = "réponse générée par IA";

function readChatExpandedPref(roomId: string): boolean {
  try {
    return sessionStorage.getItem(`${CHAT_EXPANDED_STORAGE_PREFIX}${roomId}`) === "1";
  } catch {
    return false;
  }
}
/** Garde-fou client si un `mj_status` true est perdu (WS). */
const MJ_THINKING_STALE_MS = 3 * 60 * 1000;
/** Réclamer : délai avant message d'échec si aucune réponse MJ (aligné timeout client ~270 s). */
const MJ_PROMPT_STALE_MS = 280 * 1000;
/** Réclamer : délai si le serveur n'émet aucun `mj_status` thinking après POST ok. */
const RECLAIM_NO_START_MS = 5 * 1000;
/** Réinitialiser un état MJ client bloqué au-delà de ce délai (localStorage). */
const MJ_PROMPT_RESET_MS = 2 * 60 * 1000;
const MJ_PROMPT_AT_STORAGE_PREFIX = "rpg-cr-mj-prompt-at:";
/** Message système émis par `executeAutoMj` en cas d'échec LLM. */
const MJ_FAILURE_CHAT_PREFIX = "Le MJ n'a pas pu répondre";

function isMjFailureSystemMessage(message: ChatMessage): boolean {
  return (
    message.kind === "system" &&
    message.content.startsWith(MJ_FAILURE_CHAT_PREFIX)
  );
}

function mjThinkingStatusLabel(
  phase: "opening" | "turn",
  hostPrep: "preamble" | "session_recap" | "reclaim" | null
): string {
  if (hostPrep === "preamble") return "Le MJ prépare le préambule…";
  if (hostPrep === "session_recap") return "Le MJ prépare le récap…";
  const lead =
    phase === "opening" ? "Le MJ prépare le monde…" : "Le MJ réfléchit…";
  return `${lead} — ${MJ_THINKING_IA_HINT}`;
}

const CAMPAIGN_OPENING_PREP_TEXT = "Le MJ prépare le monde…";

function isCampaignOpeningUnsettled(
  messages: ChatMessage[],
  campaignOpeningDone?: boolean
): boolean {
  if (campaignOpeningDone) return false;
  const prepIdx = messages.findIndex(
    (m) => m.kind === "system" && m.content === CAMPAIGN_OPENING_PREP_TEXT
  );
  if (prepIdx === -1) return false;
  const after = messages.slice(prepIdx + 1);
  return !after.some(
    (m) =>
      m.kind === "mj" ||
      (m.kind === "system" &&
        (m.content.startsWith("L'ouverture de campagne a échoué") ||
          m.content.startsWith(MJ_FAILURE_CHAT_PREFIX)))
  );
}

function applyMjStatusSnapshot(
  snap: MjStatusSnapshot | undefined,
  opts: {
    mjPromptPending: boolean;
    setMjThinking: (v: boolean) => void;
    setMjBackgroundScrib: (v: boolean) => void;
    setMjPhase: (v: "opening" | "turn") => void;
    mjThinkingSinceRef: { current: number | null };
  }
): void {
  if (!snap || opts.mjPromptPending) return;
  opts.setMjBackgroundScrib(Boolean(snap.background));
  if (snap.thinking) {
    opts.setMjThinking(true);
    opts.setMjPhase(snap.phase === "opening" ? "opening" : "turn");
    opts.mjThinkingSinceRef.current = Date.now();
  } else {
    opts.setMjThinking(false);
    opts.setMjPhase("turn");
    opts.mjThinkingSinceRef.current = null;
  }
}

export function RoomView({ code }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  useAutoHostTunnel(isVpsLmStudioHostMode() && session?.role === "admin");
  const [room, setRoom] = useState<Room | null>(null);
  const [scene, setScene] = useState<SceneState | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [map, setMap] = useState<ProceduralMap | null>(null);
  const [catalog, setCatalog] = useState<LlmCatalogEntry[]>([]);
  const [input, setInput] = useState("");
  const [speechMode, setSpeechMode] = useState<SpeechMode>("say");
  const [apiKey, setApiKey] = useState("");
  const [mjThinking, setMjThinking] = useState(false);
  const [mjBackgroundScrib, setMjBackgroundScrib] = useState(false);
  const [mjPhase, setMjPhase] = useState<"opening" | "turn">("turn");
  const [mjPromptBusy, setMjPromptBusy] = useState(false);
  const [reclaimError, setReclaimError] = useState<string | null>(null);
  const [hostMjPrepKind, setHostMjPrepKind] = useState<
    "reclaim" | "preamble" | "session_recap" | null
  >(null);
  const [godModeBusy, setGodModeBusy] = useState(false);
  /** Onboarding hôte LLM — resync localStorage au chargement salon. */
  const [hostLlmStepDone, setHostLlmStepDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const codeCopiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [introMode, setIntroMode] = useState<"manual" | null>(null);
  const [introDraft, setIntroDraft] = useState("");
  const [introBusy, setIntroBusy] = useState(false);
  const [viewerLocale, setViewerLocale] = useState<string>(DEFAULT_LOCALE);
  const [alertsPromptOpen, setAlertsPromptOpen] = useState(false);
  const [chatLogExpanded, setChatLogExpanded] = useState(false);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const sessionRef = useRef<Session | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const mjThinkingSinceRef = useRef<number | null>(null);
  /** Sollicitation MJ (Réclamer, etc.) — le statut WS ne doit pas effacer l'UI avant le message ou l'erreur. */
  const mjPromptPendingRef = useRef(false);
  const mjPromptStartMsgCountRef = useRef(0);
  const mjServerThinkingSeenRef = useRef(false);
  const reclaimNoStartTimerRef = useRef<number | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);
  /** Restaure la position après resync API (évite le saut en haut du fil). */
  const scrollRestoreRef = useRef<{ top: number; height: number } | null>(null);
  const sessionPlayer = players.find((p) => p.id === session?.playerId);
  const quickUseOptions = (() => {
    if (!sessionPlayer?.characterSheet) return [];
    const s = sessionPlayer.characterSheet;
    const opts: { id: string; label: string; insert: string }[] = [];
    for (const sp of s.spells ?? []) {
      if (!sp.name.trim()) continue;
      opts.push({
        id: `spell-${sp.name}`,
        label: `✦ ${sp.name}`,
        insert: `J'utilise le sort « ${sp.name} »${sp.description ? ` — ${sp.description}` : ""}`,
      });
    }
    for (const u of s.usableItems ?? []) {
      if (!u.name.trim()) continue;
      opts.push({
        id: `item-${u.name}`,
        label: `🎒 ${u.name}`,
        insert: `J'utilise « ${u.name} »${u.description ? ` — ${u.description}` : ""}`,
      });
    }
    for (const a of s.actions ?? []) {
      if (!a.name.trim()) continue;
      opts.push({
        id: `action-${a.name}`,
        label: `⚔ ${a.name}`,
        insert: a.description?.trim() || a.name,
      });
    }
    return opts;
  })();

  function insertQuickUse(text: string) {
    setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
    setSpeechMode("action");
  }
  /** true si l'utilisateur est proche du bas — on n'impose pas le scroll en lecture d'historique */
  const stickToBottomRef = useRef(true);
  const isInitialChatScroll = useRef(true);

  const captureChatScrollIfNeeded = useCallback(() => {
    const el = chatLogRef.current;
    if (!el || stickToBottomRef.current) return;
    scrollRestoreRef.current = {
      top: el.scrollTop,
      height: el.scrollHeight,
    };
  }, []);

  const replaceMessagesFromServer = useCallback((next: ChatMessage[]) => {
    setMessages((prev) => {
      if (
        prev.length === next.length &&
        prev.length > 0 &&
        prev[0]?.id === next[0]?.id &&
        prev.at(-1)?.id === next.at(-1)?.id
      ) {
        return prev;
      }
      captureChatScrollIfNeeded();
      return next;
    });
  }, [captureChatScrollIfNeeded]);
  const serverGodSyncedRef = useRef(false);
  const adminOpenRef = useRef(false);

  /** Panneau admin — localStorage via useSyncExternalStore (jamais resync serveur/WS) */
  const adminOpen = useSyncExternalStore(
    subscribeAdminPanel,
    () => (session ? loadAdminPanel(session.playerId) : false),
    () => false
  );
  adminOpenRef.current = adminOpen;

  const [llmForm, setLlmForm] = useState<LlmRoomConfig>({
    providerId: "openai",
    modelId: "gpt-4o-mini",
    useFallbackLmStudio: true,
    autoExtractFacts: true,
  });

  const refresh = useCallback(async (playerId?: string) => {
    const data = await getRoom(code);
    setRoom(data.room);
    setScene(data.room.scene ?? null);
    const myId = sessionRef.current?.playerId;
    const uiOpen = adminOpenRef.current;
    setPlayers(
      data.players.map((p) =>
        myId && p.id === myId ? { ...p, isGodMode: uiOpen } : p
      )
    );
    replaceMessagesFromServer(data.messages);
    if (!mjPromptPendingRef.current) {
      const openingUnsettled = isCampaignOpeningUnsettled(
        data.messages,
        data.room.campaignOpeningDone
      );
      const serverThinking = Boolean(data.mjStatus?.thinking);
      if (serverThinking) {
        applyMjStatusSnapshot(data.mjStatus, {
          mjPromptPending: false,
          setMjThinking,
          setMjBackgroundScrib,
          setMjPhase,
          mjThinkingSinceRef,
        });
      } else if (openingUnsettled) {
        setMjThinking(true);
        setMjPhase("opening");
        mjThinkingSinceRef.current = Date.now();
      } else {
        setMjThinking(false);
        setMjBackgroundScrib(false);
        setMjPhase("turn");
        mjThinkingSinceRef.current = null;
      }
    }
    if (mjPromptPendingRef.current) {
      const tail = data.messages.slice(mjPromptStartMsgCountRef.current);
      if (
        tail.some((m) => m.kind === "mj" || isMjFailureSystemMessage(m))
      ) {
        if (tail.some((m) => isMjFailureSystemMessage(m))) {
          setReclaimError(
            "Le MJ n'a pas pu répondre — vérifiez la config LLM ou LM Studio."
          );
        } else {
          setReclaimError(null);
        }
        mjPromptPendingRef.current = false;
        setMjPromptBusy(false);
        setMjThinking(false);
        setMjBackgroundScrib(false);
        setMjPhase("turn");
        mjThinkingSinceRef.current = null;
      }
    }
    setMap(
      sessionRef.current?.role === "admin" && adminOpenRef.current ? data.map : null
    );
    const me = myId ? data.players.find((p) => p.id === myId) : undefined;
    if (myId && !me) {
      clearSession();
      setSession(null);
      sessionRef.current = null;
      setError(
        "Ce personnage n'existe plus dans ce salon. Rejoignez depuis l'accueil avec le code."
      );
      return;
    }
    if (myId && me) {
      const loc = resolveViewerLocale(myId, me.preferredLocale);
      setViewerLocale(loc);
      saveLocaleBackup(myId, loc);
      const backup = loadLocaleBackup(myId);
      if (me.preferredLocale && backup !== me.preferredLocale) {
        void patchPlayerLocale(myId, backup).catch(() => undefined);
      }
    }
    if (data.room.llmConfig) setLlmForm(data.room.llmConfig);
  }, [code, replaceMessagesFromServer]);

  useEffect(() => {
    const s = loadSession();
    if (!s || s.roomCode.toUpperCase() !== code.toUpperCase()) {
      setError("Session invalide — rejoignez le salon depuis l'accueil.");
      setLoading(false);
      return;
    }
    setSession(s);
    sessionRef.current = s;
    setViewerLocale(loadLocaleBackup(s.playerId));

    Promise.all([refresh(s.playerId), getLlmCatalog()])
      .then(([, cat]) => setCatalog(cat))
      .catch((e) => setError(e instanceof Error ? e.message : "Erreur"))
      .finally(() => setLoading(false));

    rememberGrain({
      roomId: s.roomId,
      roomCode: s.roomCode,
      roomName: code,
      playerId: s.playerId,
      playerName: s.playerName,
      role: s.role,
    });
    touchGrain(s.roomCode, s.playerId);

  }, [code, refresh]);

  /** Alignement DB fire-and-forget — ne touche jamais l'UI du switch */
  useEffect(() => {
    if (!session || session.role !== "admin" || serverGodSyncedRef.current) return;
    serverGodSyncedRef.current = true;
    const open = loadAdminPanel(session.playerId);
    patchGodMode(session.playerId, open).catch(() => undefined);
  }, [session]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const roomId = room?.id ?? null;
  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  const clearMjThinking = useCallback(() => {
    mjPromptPendingRef.current = false;
    mjServerThinkingSeenRef.current = false;
    if (reclaimNoStartTimerRef.current) {
      clearTimeout(reclaimNoStartTimerRef.current);
      reclaimNoStartTimerRef.current = null;
    }
    setMjPromptBusy(false);
    setMjThinking(false);
    setMjBackgroundScrib(false);
    setMjPhase("turn");
    mjThinkingSinceRef.current = null;
    const rid = roomIdRef.current;
    if (rid) {
      try {
        localStorage.removeItem(`${MJ_PROMPT_AT_STORAGE_PREFIX}${rid}`);
      } catch {
        /* quota / mode privé */
      }
    }
  }, []);

  const handleWsEvent = useCallback(
    (data: RoomWsEvent) => {
      if (data.type === "message") {
        setMessages((prev) => appendChatMessage(prev, data.message));
        const ownId = sessionRef.current?.playerId;
        vibrateForWsMessage(data.message, ownId);
        notifyForWsMessage(data.message, ownId, roomIdRef.current ?? undefined);
        if (data.message.kind === "mj" || isMjFailureSystemMessage(data.message)) {
          if (isMjFailureSystemMessage(data.message)) {
            const failMsg =
              "Le MJ n'a pas pu répondre — vérifiez la config LLM ou LM Studio.";
            setReclaimError(failMsg);
            setError(failMsg);
          } else {
            setReclaimError(null);
          }
          clearMjThinking();
        } else if (
          data.message.kind === "system" &&
          data.message.content.startsWith("L'ouverture de campagne a échoué")
        ) {
          clearMjThinking();
        }
      }
      if (data.type === "players") {
        const myId = sessionRef.current?.playerId;
        const uiOpen = adminOpenRef.current;
        setPlayers(
          data.players.map((p) =>
            myId && p.id === myId ? { ...p, isGodMode: uiOpen } : p
          )
        );
      }
      if (data.type === "mj_status") {
        setMjBackgroundScrib(Boolean(data.background));
        if (data.thinking) {
          if (mjPromptPendingRef.current) {
            mjServerThinkingSeenRef.current = true;
          }
          setMjThinking(true);
          setMjPhase(data.phase === "opening" ? "opening" : "turn");
          mjThinkingSinceRef.current = Date.now();
        } else if (!mjPromptPendingRef.current) {
          setMjThinking(false);
          setMjPhase("turn");
          mjThinkingSinceRef.current = null;
        }
      }
      if (data.type === "scene") {
        setScene(data.scene);
        setRoom((prev) => (prev ? { ...prev, scene: data.scene } : prev));
      }
    },
    [clearMjThinking]
  );

  const syncRoomFromApi = useCallback(() => {
    return refresh().catch(() => undefined);
  }, [refresh]);

  const { wsRef } = useRoomWebSocket({
    roomId,
    playerId: session?.playerId,
    playerName: session?.playerName,
    enabled: Boolean(session && roomId),
    onSync: syncRoomFromApi,
    onEvent: handleWsEvent,
  });

  useEffect(() => {
    if (!session || !roomId) {
      setAlertsPromptOpen(false);
      return;
    }
    setAlertsPromptOpen(shouldShowAlertsPrompt(roomId));
  }, [session, roomId]);

  useEffect(() => {
    return () => clearMjThinking();
  }, [clearMjThinking]);

  useEffect(() => {
    if (!room?.id) return;
    try {
      const raw = localStorage.getItem(
        `${MJ_PROMPT_AT_STORAGE_PREFIX}${room.id}`
      );
      if (!raw) return;
      const at = Number(raw);
      if (!Number.isFinite(at) || Date.now() - at < MJ_PROMPT_RESET_MS) return;
    } catch {
      return;
    }
    clearMjThinking();
    setReclaimError(null);
  }, [room?.id, clearMjThinking]);

  useEffect(() => {
    if (!mjThinking && !mjPromptPendingRef.current) return;
    const check = () => {
      const since = mjThinkingSinceRef.current;
      if (since == null) return;
      const elapsed = Date.now() - since;
      if (mjPromptPendingRef.current && elapsed >= MJ_PROMPT_STALE_MS) {
        clearMjThinking();
        const staleMsg =
          "Le MJ met trop de temps à répondre — réessayez Réclamer ou vérifiez la connexion.";
        setReclaimError(staleMsg);
        setError(staleMsg);
        return;
      }
      if (elapsed >= MJ_THINKING_STALE_MS) {
        clearMjThinking();
      }
    };
    check();
    const id = window.setInterval(check, 15_000);
    return () => window.clearInterval(id);
  }, [mjThinking, mjPromptBusy, clearMjThinking]);

  useEffect(() => {
    if (!mjThinking) {
      setHostMjPrepKind(null);
    }
  }, [mjThinking]);

  useEffect(() => {
    if (!room?.id) return;
    setChatLogExpanded(readChatExpandedPref(room.id));
  }, [room?.id]);

  const setChatExpanded = useCallback(
    (next: boolean) => {
      setChatLogExpanded(next);
      if (!room?.id) return;
      try {
        if (next) {
          sessionStorage.setItem(`${CHAT_EXPANDED_STORAGE_PREFIX}${room.id}`, "1");
        } else {
          sessionStorage.removeItem(`${CHAT_EXPANDED_STORAGE_PREFIX}${room.id}`);
        }
      } catch {
        /* quota / mode privé */
      }
    },
    [room?.id]
  );

  useEffect(() => {
    if (!chatLogExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatLogExpanded]);

  const updateStickToBottom = useCallback(() => {
    const el = chatLogRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance <= CHAT_SCROLL_THRESHOLD_PX;
  }, []);

  useLayoutEffect(() => {
    const el = chatLogRef.current;
    if (!el) return;

    if (stickToBottomRef.current) {
      const behavior: ScrollBehavior = isInitialChatScroll.current
        ? "instant"
        : "smooth";
      isInitialChatScroll.current = false;
      scrollChatLogToBottom(el, behavior);
      scrollRestoreRef.current = null;
      return;
    }

    const snap = scrollRestoreRef.current;
    if (!snap) return;
    const delta = el.scrollHeight - snap.height;
    el.scrollTop = Math.max(0, snap.top + delta);
    scrollRestoreRef.current = null;
  }, [messages]);

  function sendChat() {
    const me = players.find((p) => p.id === session?.playerId);
    if (me && !canHumanParticipateInChat(me)) return;

    if (!input.trim()) {
      if (hostReclaimEligible) {
        void handleHostReclaim();
      } else {
        void handleMjPrompt("reclaim");
      }
      return;
    }

    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    stickToBottomRef.current = true;
    if (speechMode === "action" && hasLlmConfig) {
      setMjThinking(true);
      mjThinkingSinceRef.current = Date.now();
    }
    wsRef.current.send(
      JSON.stringify({ type: "chat", content: input.trim(), kind: speechMode })
    );
    setInput("");
  }

  async function submitIntroduction(mode: "manual" | "auto", text?: string) {
    if (!session || !me || introBusy) return;
    setIntroBusy(true);
    setError(null);
    stickToBottomRef.current = true;
    try {
      const { player, message } = await introducePlayer(
        me.id,
        session.playerId,
        { mode, text }
      );
      setPlayers((prev) => prev.map((p) => (p.id === player.id ? player : p)));
      setMessages((prev) => appendChatMessage(prev, message));
      setIntroMode(null);
      setIntroDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Présentation impossible");
    } finally {
      setIntroBusy(false);
    }
  }

  async function handleMjPrompt(type: MjPromptType) {
    if (!session || !room || !chatReady) {
      setReclaimError("Rejoignez la table (fiche prête et présentation faite) pour réclamer.");
      return;
    }
    if (mjPromptBusy || mjPromptPendingRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.debug("[Réclamer] ignoré — sollicitation déjà en cours");
      }
      return;
    }
    if (mjThinking && !mjPromptPendingRef.current) {
      const busyMsg = "Le MJ répond déjà — attendez la fin du tour en cours.";
      setReclaimError(busyMsg);
      setError(busyMsg);
      return;
    }
    if (!hasLlmConfig) {
      const noLlmMsg =
        "Le MJ n'est pas disponible — demandez à l'hôte de configurer le modèle (god mode).";
      setReclaimError(noLlmMsg);
      setError(noLlmMsg);
      return;
    }

    setReclaimError(null);
    setHostMjPrepKind(
      type === "preamble" || type === "session_recap"
        ? type
        : type === "reclaim"
          ? "reclaim"
          : null
    );
    mjPromptPendingRef.current = true;
    mjPromptStartMsgCountRef.current = messages.length;
    mjServerThinkingSeenRef.current = false;
    setMjPromptBusy(true);
    setMjThinking(true);
    setMjPhase(type === "preamble" ? "opening" : "turn");
    mjThinkingSinceRef.current = Date.now();
    setError(null);
    try {
      localStorage.setItem(
        `${MJ_PROMPT_AT_STORAGE_PREFIX}${room.id}`,
        String(Date.now())
      );
    } catch {
      /* ignore */
    }
    stickToBottomRef.current = true;
    if (reclaimNoStartTimerRef.current) {
      clearTimeout(reclaimNoStartTimerRef.current);
    }
    reclaimNoStartTimerRef.current = window.setTimeout(() => {
      if (!mjPromptPendingRef.current) return;
      if (mjServerThinkingSeenRef.current) return;
      const noStartMsg =
        "Le MJ ne démarre pas — vérifiez que l'API tourne (npm run dev) et la config LLM.";
      setReclaimError(noStartMsg);
      setError(noStartMsg);
      clearMjThinking();
      setHostMjPrepKind(null);
    }, RECLAIM_NO_START_MS);
    try {
      await promptMj(room.id, session.playerId, type);
      if (process.env.NODE_ENV === "development") {
        console.debug("[Réclamer] POST ok, type=", type);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Impossible de solliciter le MJ";
      setReclaimError(msg);
      setError(msg);
      clearMjThinking();
      setHostMjPrepKind(null);
    }
  }

  function isRecapDoneThisSession(roomId: string): boolean {
    try {
      return sessionStorage.getItem(hostRecapSessionStorageKey(roomId)) === "1";
    } catch {
      return false;
    }
  }

  function markRecapDoneThisSession(roomId: string): void {
    try {
      sessionStorage.setItem(hostRecapSessionStorageKey(roomId), "1");
    } catch {
      /* ignore */
    }
  }

  function resolveHostReclaimType(): MjHostReclaimChoice {
    if (!room) return "reclaim";
    return pickHostMjPromptType(
      room,
      messages.length,
      isRecapDoneThisSession(room.id)
    );
  }

  function handleHostReclaim() {
    if (!room) return;
    const type = resolveHostReclaimType();
    if (type === "session_recap") {
      markRecapDoneThisSession(room.id);
    }
    void handleMjPrompt(type);
  }

  function handleReclaimClick() {
    if (hostReclaimEligible) {
      void handleHostReclaim();
      return;
    }
    void handleMjPrompt("reclaim");
  }

  function handleGodModeChange(enabled: boolean) {
    if (!session || godModeBusy) return;
    setGodModeBusy(true);
    setError(null);
    saveAdminPanel(session.playerId, enabled);
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === session.playerId ? { ...p, isGodMode: enabled } : p
      )
    );
    patchGodMode(session.playerId, enabled).catch(() => {
      setError(
        "Synchronisation serveur god mode échouée — l'affichage local est conservé."
      );
    }).finally(() => setGodModeBusy(false));
  }

  async function handleSaveLlm(config: LlmRoomConfig) {
    if (!room) return;
    await saveLlmConfig(room.id, config, session?.playerId);
    setLlmForm(config);
    const data = await getRoom(code);
    setRoom(data.room);
    setScene(data.room.scene ?? null);
    const myId = session?.playerId;
    setPlayers(
      data.players.map((p) =>
        myId && p.id === myId ? { ...p, isGodMode: adminOpenRef.current } : p
      )
    );
    replaceMessagesFromServer(data.messages);
    setMap(isAdminGod ? data.map : null);
    if (!data.room.llmConfig) {
      throw new Error(
        "Configuration non persistée (le salon reste non configuré). Réessayez, puis vérifiez que l'API est joignable."
      );
    }
  }

  async function handleTestLlm() {
    if (!room || !session) return;
    await testLlmConfig(room.id, session.playerId, apiKey || undefined);
  }

  function handleHostSetupContinue() {
    if (!room) return;
    markHostLlmSetupComplete(room.id);
    setHostLlmStepDone(true);
  }

  useEffect(() => {
    if (room?.id && isHostLlmSetupComplete(room.id)) {
      setHostLlmStepDone(true);
    }
  }, [room?.id]);

  useEffect(() => {
    if (room?.name && session) {
      rememberGrain({
        roomId: session.roomId,
        roomCode: session.roomCode,
        roomName: room.name,
        playerId: session.playerId,
        playerName: session.playerName,
        role: session.role,
      });
    }
  }, [room?.name, session]);

  useEffect(() => {
    return () => {
      if (codeCopiedTimeoutRef.current) {
        clearTimeout(codeCopiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyRoomCode = useCallback(async () => {
    const roomCode = room?.code;
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCodeCopied(true);
      if (codeCopiedTimeoutRef.current) {
        clearTimeout(codeCopiedTimeoutRef.current);
      }
      codeCopiedTimeoutRef.current = setTimeout(() => {
        setCodeCopied(false);
        codeCopiedTimeoutRef.current = null;
      }, 2000);
    } catch {
      setError("Impossible de copier le code — copiez-le manuellement.");
    }
  }, [room?.code]);

  async function handleLeave() {
    if (!session || !room || leaving) return;
    if (
      !window.confirm(
        "Quitter la table ? La campagne reste sur le serveur ; un snapshot .md sera créé."
      )
    ) {
      return;
    }
    setLeaving(true);
    setError(null);
    try {
      await snapshotCampaign(room.id);
      rememberGrain({
        roomId: session.roomId,
        roomCode: session.roomCode,
        roomName: room.name,
        playerId: session.playerId,
        playerName: session.playerName,
        role: session.role,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Export partiel — vous pouvez quitter quand même."
      );
    } finally {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "presence", status: "leaving" }));
      }
      wsRef.current?.close();
      clearSession();
      router.push("/");
    }
  }

  const isAdmin = session?.role === "admin";
  const hasLlmConfig = Boolean(room?.llmConfig);
  const me = players.find((p) => p.id === session?.playerId);
  const hostPlayer = players.find((p) => p.role === "admin");
  const hostLocale = hostPlayer?.preferredLocale ?? "fr";
  const needsCharacter =
    me?.kind === "human" && me.characterStatus !== "ready";
  const showHostLlmSetup =
    isAdmin &&
    needsCharacter &&
    Boolean(room?.id) &&
    !hostLlmStepDone &&
    (!hasLlmConfig || !isHostLlmSetupComplete(room!.id));
  const showCharacterWizard =
    needsCharacter && !showHostLlmSetup;
  const awaitingIntroduction =
    me?.kind === "human" &&
    me.characterStatus === "ready" &&
    !me.introducedInStory;
  const campaignOpeningInProgress = useMemo(
    () =>
      (mjThinking && mjPhase === "opening") ||
      isCampaignOpeningUnsettled(messages, room?.campaignOpeningDone),
    [mjThinking, mjPhase, messages, room?.campaignOpeningDone]
  );
  const chatReady = me != null && canHumanParticipateInChat(me);
  const hostReclaimEligible =
    isAdmin && chatReady && !input.trim() && hasLlmConfig;
  const showCharacterSheet =
    me?.kind !== "human" || me.characterStatus === "ready";
  const [roomSideTab, setRoomSideTab] = useState<RoomSideTab>("main");
  useEffect(() => {
    if (room?.id) setRoomSideTab(loadRoomSideTab(room.id));
  }, [room?.id]);
  function handleRoomSideTab(tab: RoomSideTab) {
    setRoomSideTab(tab);
    if (room?.id) saveRoomSideTab(room.id, tab);
    if (tab !== "main" && chatLogExpanded) setChatExpanded(false);
  }
  const isMainView = roomSideTab === "main";
  const showSceneSection = isMainView;

  useEffect(() => {
    if (!room?.id || !session?.playerId || !chatReady) {
      setMentionCandidates([]);
      return;
    }
    void fetchMentionSuggestions(room.id, session.playerId)
      .then((data) => setMentionCandidates(data.candidates))
      .catch(() => setMentionCandidates([]));
  }, [room?.id, session?.playerId, chatReady, players, messages.length]);
  const showCompanionsSection = roomSideTab === "companions";
  const showSheetSection = roomSideTab === "sheet" && showCharacterSheet;
  const showSettingsSection = roomSideTab === "settings";
  const showAssistantFocused = roomSideTab === "assistant";
  const showAssistantInline =
    isMainView &&
    Boolean(session && hasLlmConfig && me && chatReady && !chatLogExpanded);
  const isAdminGod = isAdmin && adminOpen;
  const visibleMessages = filterMessagesForViewer(messages, isAdminGod);
  const recentSceneTexts = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            m.content.trim() &&
            (m.kind === "mj" || m.kind === "say" || m.kind === "chat" || m.kind === "action")
        )
        .slice(-30)
        .map((m) => m.content),
    [messages]
  );
  const displayError =
    error && shouldShowErrorToPlayer(error, isAdminGod) ? error : null;

  useEffect(() => {
    if (!room) return;
    if (!isAdminGod) {
      setMap(null);
      return;
    }
    getRoom(code)
      .then((data) => setMap(data.map))
      .catch(() => undefined);
  }, [isAdminGod, room?.id, code]);

  if (loading) {
    return (
      <main className="layout">
        <p className="muted">Chargement du salon…</p>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="layout">
        <p style={{ color: "var(--danger)" }}>{error}</p>
        <Link href="/">Retour</Link>
      </main>
    );
  }

  const mjInputThinking = mjThinking;

  const showRoomDock = !showHostLlmSetup && !chatLogExpanded;

  return (
    <main className={showRoomDock ? "layout layout--room-dock" : "layout"}>
      <RoomDockNav
        active={roomSideTab}
        onChange={handleRoomSideTab}
        hidden={!showRoomDock}
      />
      <header className="room-header">
        <div>
          <h1>{room?.name ?? "Salon"}</h1>
          <p className="muted room-meta">
            {room?.code ? (
              <>
                <button
                  type="button"
                  className="room-code-copy"
                  onClick={() => void handleCopyRoomCode()}
                  title="Copier le code du salon"
                  aria-label={`Code salon ${room.code}. Cliquer pour copier`}
                >
                  <strong>{room.code}</strong>
                </button>
                {codeCopied && (
                  <span className="room-code-copied" aria-hidden="true">
                    Copié !
                  </span>
                )}
                <span className="sr-only" aria-live="polite">
                  {codeCopied ? "Copié !" : ""}
                </span>
              </>
            ) : null}
            {isAdmin && adminOpen && (
              <>
                {room?.code ? " · " : null}
                <span className="badge god">God mode</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className="leave-room-btn"
          disabled={leaving}
          onClick={handleLeave}
          title="Sauvegarder et quitter"
          aria-label={
            leaving ? "Scellement de la campagne…" : "Sauvegarder et quitter"
          }
        >
          <span className="leave-room-btn-icon" aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className="leave-room-btn-label">
            {leaving ? "Scellement…" : "Sauvegarder et quitter"}
          </span>
        </button>
      </header>

      {displayError && (
        <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{displayError}</p>
      )}

      {alertsPromptOpen && roomId && (
        <MessageAlertsPrompt
          roomId={roomId}
          onClose={() => setAlertsPromptOpen(false)}
        />
      )}

      <div className="room-shell">
        <div className="room-layout">
        <section
          className={
            showCharacterWizard && isAdmin
              ? "room-main chat-section-wizard-host"
              : "room-main"
          }
        >
          {showHostLlmSetup && session && room && (
            <HostSetupWizard
              roomCode={room.code}
              catalog={catalog}
              llmForm={llmForm}
              setLlmForm={setLlmForm}
              apiKey={apiKey}
              setApiKey={setApiKey}
              hasLlmConfig={hasLlmConfig}
              onSave={handleSaveLlm}
              onTest={handleTestLlm}
              onContinue={handleHostSetupContinue}
            />
          )}
          {showCharacterWizard && me && session && (
            <CharacterCreationWizard
              player={me}
              actorPlayerId={session.playerId}
              llmEnabled={hasLlmConfig}
              isHostAdmin={isAdmin}
              onComplete={(p) => {
                setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
              }}
              onPlayerUpdate={(p) => {
                setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)));
              }}
              onError={setError}
            />
          )}
          {showAssistantFocused && session && hasLlmConfig && me && (
            <div className="room-focused-view room-focused-view--assistant">
              <h2 className="room-focused-title">Aide personnelle du héros</h2>
              <HeroAssistantPanel
                playerId={session.playerId}
                actorPlayerId={session.playerId}
                roomId={room?.id}
                mentionCandidates={mentionCandidates}
                llmEnabled={hasLlmConfig}
                mode="play"
                title="Conseiller du personnage"
                defaultCollapsed={false}
                onError={setError}
              />
            </div>
          )}

          {showSceneSection && (
          <div>
          <div className={needsCharacter || showHostLlmSetup ? "chat-blocked" : undefined}>
          <div className="table-header-row">
            {room && session && (
              <SceneIndicator
                roomId={room.id}
                actorPlayerId={session.playerId}
                scene={scene}
                recentTexts={recentSceneTexts}
                isAdminGod={isAdminGod}
                llmEnabled={hasLlmConfig}
                onSceneChange={(next) => {
                  setScene(next);
                  setRoom((prev) => (prev ? { ...prev, scene: next } : prev));
                }}
              />
            )}
            <ScribIndicator active={mjBackgroundScrib} />
          </div>
          {showHostLlmSetup && (
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              Hôte : configurez le MJ (étape 1) avant de créer votre personnage.
            </p>
          )}
          {showCharacterWizard && (
            <p className="muted" style={{ marginBottom: "0.75rem" }}>
              Finalisez votre personnage pour rejoindre la conversation.
            </p>
          )}
          <div
            className={
              chatLogExpanded ? "chat-panel chat-panel--log-expanded" : "chat-panel"
            }
          >
            <div
              className={
                mjInputThinking
                  ? "chat-log-wrap chat-log-wrap--mj-thinking"
                  : "chat-log-wrap"
              }
              data-expanded={chatLogExpanded || undefined}
            >
              <div className="chat-log-toolbar">
                <button
                  type="button"
                  className="chat-log-expand-btn"
                  onClick={() => setChatExpanded(!chatLogExpanded)}
                  aria-pressed={chatLogExpanded}
                  aria-label={chatLogExpanded ? "Fermer" : "Agrandir le récit en plein écran"}
                  title={chatLogExpanded ? "Fermer" : "Plein écran"}
                >
                  {chatLogExpanded ? (
                    <span aria-hidden>⊟</span>
                  ) : (
                    <span aria-hidden>⛶</span>
                  )}
                </button>
              </div>
              <div className="chat-log" ref={chatLogRef} onScroll={updateStickToBottom}>
                {visibleMessages.map((m) => (
                  <ChatMessageRow
                    key={m.id}
                    message={m}
                    players={players}
                    viewerPlayerId={session?.playerId ?? ""}
                    viewerLocale={viewerLocale}
                    hostLocale={hostLocale}
                    roomId={room?.id ?? ""}
                    llmEnabled={hasLlmConfig}
                  />
                ))}
              </div>
              {mjInputThinking ? (
                <p
                  className="chat-mj-status"
                  role="status"
                  aria-live="polite"
                  aria-label={mjThinkingStatusLabel(mjPhase, hostMjPrepKind)}
                >
                  <span className="chat-mj-spinner" aria-hidden />
                  {mjThinkingStatusLabel(mjPhase, hostMjPrepKind)}
                </p>
              ) : null}
            </div>

          {awaitingIntroduction ? (
            <div className="player-intro-panel" role="region" aria-label="Entrée en scène">
              {campaignOpeningInProgress ? (
                <p className="muted" style={{ margin: 0 }}>
                  Le MJ prépare l&apos;ouverture de la campagne — patientez le temps du
                  premier récit (peut prendre 1 à 2 min avec LM Studio).
                </p>
              ) : (
                <>
              <p className="muted" style={{ margin: 0 }}>
                Votre fiche est prête — présentez votre personnage pour rejoindre la
                conversation.
              </p>
              {introMode === "manual" ? (
                <>
                  <textarea
                    value={introDraft}
                    onChange={(e) => setIntroDraft(e.target.value)}
                    placeholder="Qui êtes-vous ? Pourquoi êtes-vous ici ?…"
                    disabled={introBusy}
                    autoFocus
                  />
                  <div className="player-intro-submit-row">
                    <button
                      type="button"
                      disabled={introBusy}
                      onClick={() => {
                        setIntroMode(null);
                        setIntroDraft("");
                      }}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={introBusy || !introDraft.trim()}
                      onClick={() => void submitIntroduction("manual", introDraft)}
                    >
                      {introBusy ? "Envoi…" : "Entrer en scène"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="player-intro-actions">
                  <button
                    type="button"
                    className="primary"
                    disabled={introBusy}
                    onClick={() => setIntroMode("manual")}
                  >
                    Se présenter
                  </button>
                  <button
                    type="button"
                    disabled={introBusy || !hasLlmConfig}
                    title={
                      hasLlmConfig
                        ? undefined
                        : "Configurez le MJ en god mode pour la présentation automatique"
                    }
                    onClick={() => void submitIntroduction("auto")}
                  >
                    {introBusy ? "Génération…" : "Présentation automatique"}
                  </button>
                </div>
              )}
                </>
              )}
            </div>
          ) : (
            <>
              <div className="speech-mode-row" role="group" aria-label="Mode d'envoi">
                <button
                  type="button"
                  className={`speech-mode-btn say${speechMode === "say" ? " active" : ""}`}
                  onClick={() => setSpeechMode("say")}
                  aria-pressed={speechMode === "say"}
                >
                  <span className="speech-icon" aria-hidden>
                    🗣
                  </span>
                  Dire
                </button>
                <button
                  type="button"
                  className={`speech-mode-btn action${speechMode === "action" ? " active" : ""}`}
                  onClick={() => setSpeechMode("action")}
                  aria-pressed={speechMode === "action"}
                >
                  <span className="speech-icon" aria-hidden>
                    ⚔
                  </span>
                  Action
                </button>
              </div>

              {speechMode === "action" && quickUseOptions.length > 0 && chatReady && (
                <div className="quick-use-row" role="group" aria-label="Utiliser depuis la fiche">
                  <span className="muted quick-use-label">Utiliser…</span>
                  {quickUseOptions.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className="quick-use-btn"
                      onClick={() => insertQuickUse(opt.insert)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="chat-form">
                <ChatMentionInput
                  value={input}
                  onChange={setInput}
                  onSubmit={sendChat}
                  candidates={mentionCandidates}
                  disabled={!chatReady || mjPromptBusy}
                  placeholder={
                    needsCharacter
                      ? "Création du personnage requise…"
                      : speechMode === "say"
                        ? "Votre parole au conseil… (@ pour mentionner)"
                        : "Décrivez le geste… (@ pour mentionner)"
                  }
                  className={speechMode === "action" ? "input-action" : "input-say"}
                />
                <div className="chat-form-actions">
                  {hostReclaimEligible ? (
                    <button
                      type="button"
                      className="btn-reclaim"
                      onClick={handleReclaimClick}
                      disabled={
                        !chatReady ||
                        mjPromptBusy ||
                        (mjThinking && !mjPromptBusy)
                      }
                      aria-busy={mjPromptBusy || mjThinking}
                      title="Solliciter le MJ (préambule, récap ou suite selon la campagne)"
                    >
                      {mjPromptBusy || mjThinking ? "Réclamer…" : "Réclamer"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={
                        input.trim()
                          ? speechMode === "action"
                            ? "btn-action"
                            : "primary"
                          : "btn-reclaim"
                      }
                      onClick={() => {
                        if (!input.trim()) void handleReclaimClick();
                        else sendChat();
                      }}
                      disabled={
                        !chatReady ||
                        mjPromptBusy ||
                        (mjThinking && !mjPromptBusy) ||
                        (!input.trim() && !hasLlmConfig)
                      }
                      aria-busy={
                        !input.trim() && (mjPromptBusy || mjThinking)
                      }
                      title={
                        !input.trim() && !hasLlmConfig
                          ? "Configurez le MJ en god mode pour réclamer"
                          : !input.trim()
                            ? "Le MJ enrichit la scène en cours"
                            : undefined
                      }
                    >
                      {input.trim()
                        ? speechMode === "say"
                          ? "Proclamer"
                          : "Agir"
                        : mjPromptBusy || mjThinking
                          ? "Réclamer…"
                          : "Réclamer"}
                    </button>
                  )}
                </div>
                {reclaimError ? (
                  <p
                    className="reclaim-error"
                    role="alert"
                    style={{ color: "var(--danger)", margin: "0.5rem 0 0", fontSize: "0.9rem" }}
                  >
                    {reclaimError}
                  </p>
                ) : null}
              </div>

              {showAssistantInline && (
                <HeroAssistantPanel
                  playerId={session!.playerId}
                  actorPlayerId={session!.playerId}
                  roomId={room?.id}
                  mentionCandidates={mentionCandidates}
                  llmEnabled={hasLlmConfig}
                  mode="play"
                  title="Aide personnelle du héros"
                  defaultCollapsed={false}
                  onError={setError}
                />
              )}
            </>
          )}
          </div>
          </div>
          </div>
          )}

          {showCompanionsSection && session && room && (
            <div
              className={
                roomSideTab === "companions" ? "room-focused-view" : undefined
              }
            >
              {roomSideTab === "companions" && (
                <h2 className="room-focused-title">Compagnons</h2>
              )}
            <PlayerCompanionList
              players={players}
              sessionPlayerId={session.playerId}
              roomId={room.id}
              isAdmin={isAdmin}
              adminOpen={adminOpen}
              onPlayersChange={setPlayers}
              onError={setError}
            />
            </div>
          )}

          {showSheetSection && session && room && (
            <div
              className={
                roomSideTab === "sheet" ? "room-focused-view" : undefined
              }
            >
              {roomSideTab === "sheet" && (
                <h2 className="room-focused-title">Fiche personnage</h2>
              )}
            <CharacterSheetPanel
              players={players}
              sessionPlayerId={session.playerId}
              isAdminGod={isAdminGod}
              llmEnabled={hasLlmConfig}
              onPlayerUpdate={(p) =>
                setPlayers((prev) => prev.map((x) => (x.id === p.id ? p : x)))
              }
              onError={setError}
            />
            </div>
          )}

          {showSettingsSection && session && (
            <div
              className={
                roomSideTab === "settings"
                  ? "room-focused-view room-focused-view--settings"
                  : undefined
              }
            >
              {roomSideTab === "settings" && (
                <h2 className="room-focused-title">
                  {isAdmin ? "Administration" : "Préférences"}
                </h2>
              )}
            <div className="panel admin-panel-compact">
              {isAdmin ? (
                <>
                  <div className="toggle-row">
                    <h2 style={{ margin: 0 }}>Administration</h2>
                    <GodModeSwitch
                      checked={adminOpen}
                      disabled={godModeBusy}
                      onChange={handleGodModeChange}
                    />
                  </div>
                </>
              ) : (
                <h2 style={{ margin: 0 }}>Préférences</h2>
              )}

              <LocaleSelector
                playerId={session.playerId}
                value={viewerLocale}
                onChange={(loc) => {
                  setViewerLocale(loc);
                  setPlayers((prev) =>
                    prev.map((p) =>
                      p.id === session.playerId ? { ...p, preferredLocale: loc } : p
                    )
                  );
                }}
                onError={setError}
              />

              {isAdmin && adminOpen && !showHostLlmSetup ? (
                <div className="god-panel">
                  <AdminLlmForm
                    catalog={catalog}
                    llmForm={llmForm}
                    setLlmForm={setLlmForm}
                    apiKey={apiKey}
                    setApiKey={setApiKey}
                    onSave={handleSaveLlm}
                    onTest={handleTestLlm}
                    initialCollapsed={hasLlmConfig}
                  />

                  <InviteQrPanel code={code} />

                  {map && (
                    <div style={{ marginTop: "1rem" }}>
                      <h3>Carte du monde</h3>
                      <p className="muted" style={{ marginBottom: "0.5rem" }}>
                        Graine {map.seed} — {map.countries.join(", ")}
                      </p>
                      <div
                        className="map-wrap"
                        dangerouslySetInnerHTML={{ __html: map.svg }}
                      />
                    </div>
                  )}

                  {room && (
                    <GraineReader roomId={room.id} actorPlayerId={session.playerId} />
                  )}

                  {room && (
                    <NarrativeCanonPanel
                      roomId={room.id}
                      actorPlayerId={session.playerId}
                      isAdminGod={isAdminGod}
                      llmEnabled={hasLlmConfig}
                      onError={setError}
                    />
                  )}
                </div>
              ) : null}
            </div>
            </div>
          )}

        </section>
        </div>
      </div>
    </main>
  );
}
