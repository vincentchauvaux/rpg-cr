"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, getRoom, joinRoom, listCampaigns, listUserGrainsFromApi, linkPlayerToUserApi } from "@/lib/api";
import { GoogleAuthPanel, useAppUserId } from "@/components/GoogleAuthPanel";
import { useAutoHostTunnel } from "@/hooks/use-auto-host-tunnel";
import { markHostLlmSetupPending } from "@/lib/host-llm-setup";
import { randomPlayerName, randomRoomName } from "@/lib/random-names";
import {
  useRandomCreateSuggestions,
  useRandomJoinPlayerSuggestion,
} from "@/lib/use-random-suggestions";
import { saveSession, clearSession } from "@/lib/session";
import {
  findMostRecentGrainForRoom,
  listGrains,
  rememberGrain,
  removeGrain,
  type GrainRecord,
} from "@/lib/grains";
import { loadSession } from "@/lib/session";
import {
  PlaceholderInput,
  resolvePlaceholderValue,
} from "@/components/PlaceholderInput";

function formatActivity(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function HomePageContent() {
  const router = useRouter();
  const appUserId = useAppUserId();
  useAutoHostTunnel(Boolean(appUserId));
  const [tab, setTab] = useState<"create" | "join" | "grains">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    roomSuggestion,
    setRoomSuggestion,
    adminSuggestion,
    setAdminSuggestion,
  } = useRandomCreateSuggestions();
  const [roomValue, setRoomValue] = useState("");
  const [adminValue, setAdminValue] = useState("");

  const {
    joinPlayerSuggestion,
    setJoinPlayerSuggestion,
  } = useRandomJoinPlayerSuggestion();
  const [joinPlayerValue, setJoinPlayerValue] = useState("");

  const [grains, setGrains] = useState<GrainRecord[]>([]);
  const [grainMeta, setGrainMeta] = useState<
    Record<string, { lastActivityAt: string | null; hasExport: boolean }>
  >({});

  const refreshGrains = useCallback(async () => {
    const local = listGrains();
    let merged = [...local];
    if (appUserId) {
      try {
        const { grains: serverGrains } = await listUserGrainsFromApi(appUserId);
        for (const sg of serverGrains) {
          const idx = merged.findIndex(
            (g) => g.roomCode.toUpperCase() === sg.roomCode.toUpperCase()
          );
          const record: GrainRecord = {
            roomId: sg.roomId,
            roomCode: sg.roomCode,
            roomName: sg.roomName,
            playerId: sg.playerId,
            playerName: sg.playerName,
            role: sg.role,
            lastVisitedAt: sg.lastActivityAt ?? new Date().toISOString(),
          };
          if (idx >= 0) merged[idx] = { ...merged[idx], ...record };
          else merged.push(record);
        }
        merged.sort((a, b) => {
          const ta = a.lastVisitedAt ? Date.parse(a.lastVisitedAt) : 0;
          const tb = b.lastVisitedAt ? Date.parse(b.lastVisitedAt) : 0;
          return tb - ta;
        });
      } catch {
        /* grains locales seulement */
      }
    }
    setGrains(merged);
    if (!merged.length) {
      setGrainMeta({});
      return;
    }
    try {
      const { campaigns } = await listCampaigns(merged.map((g) => g.roomCode));
      const map: Record<string, { lastActivityAt: string | null; hasExport: boolean }> =
        {};
      for (const c of campaigns) {
        map[c.room.code.toUpperCase()] = {
          lastActivityAt: c.lastActivityAt,
          hasExport: c.hasMarkdownExport,
        };
      }
      setGrainMeta(map);
    } catch {
      /* liste locale seulement */
    }
  }, [appUserId]);

  useEffect(() => {
    if (tab === "grains") refreshGrains();
  }, [tab, refreshGrains]);

  function rollAllCreate() {
    setRoomSuggestion(randomRoomName());
    setAdminSuggestion(randomPlayerName());
    setRoomValue("");
    setAdminValue("");
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const name = resolvePlaceholderValue(roomValue, roomSuggestion);
    const adminName = resolvePlaceholderValue(adminValue, adminSuggestion);
    try {
      const { room, admin } = await createRoom(name, adminName, appUserId);
      markHostLlmSetupPending(room.id);
      const session = {
        roomId: room.id,
        roomCode: room.code,
        playerId: admin.id,
        playerName: admin.name,
        role: "admin" as const,
      };
      saveSession(session);
      rememberGrain({
        ...session,
        roomName: room.name,
      });
      router.push(`/salon/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code") ?? "").toUpperCase();
    const playerName = resolvePlaceholderValue(
      joinPlayerValue,
      joinPlayerSuggestion
    );
    try {
      const grain = findMostRecentGrainForRoom(code);
      if (grain) {
        resumeGrain(grain);
        return;
      }

      const prior = loadSession();
      if (prior?.roomCode.toUpperCase() === code) {
        saveSession({ ...prior, playerName: prior.playerName });
        rememberGrain({
          roomId: prior.roomId,
          roomCode: prior.roomCode,
          roomName: code,
          playerId: prior.playerId,
          playerName: prior.playerName,
          role: prior.role,
        });
        router.push(`/salon/${code}`);
        return;
      }

      const { room } = await getRoom(code);
      const { player } = await joinRoom(room.id, playerName, undefined, appUserId);
      const session = {
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        playerName: player.name,
        role: player.role,
      };
      saveSession(session);
      rememberGrain({
        ...session,
        roomName: room.name,
      });
      router.push(`/salon/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function resumeGrain(g: GrainRecord) {
    if (appUserId) {
      void linkPlayerToUserApi(g.playerId, appUserId).catch(() => undefined);
    }
    saveSession({
      roomId: g.roomId,
      roomCode: g.roomCode,
      playerId: g.playerId,
      playerName: g.playerName,
      role: g.role,
    });
    rememberGrain(g);
    router.push(`/salon/${g.roomCode}`);
  }

  function forgetGrain(g: GrainRecord) {
    if (
      !window.confirm(
        `Oublier « ${g.roomName} » de cette tablette locale ? (La campagne reste sur le serveur.)`
      )
    ) {
      return;
    }
    removeGrain(g.roomCode, g.playerId);
    clearSession();
    refreshGrains();
  }

  return (
    <main className="layout">
      <header className="hero">
        <h1>RPG-CR</h1>
        <p className="tagline">
          Créez une table, partagez le parchemin — le MJ veille (quand il n&apos;a
          pas oublié ses dés).
        </p>
      </header>

      <div style={{ maxWidth: 520, margin: "0 auto 1rem" }}>
        <GoogleAuthPanel />
      </div>

      <div className="panel" style={{ maxWidth: 520, margin: "0 auto" }}>
        <div className="home-tabs">
          <button
            type="button"
            className={tab === "create" ? "primary" : ""}
            onClick={() => setTab("create")}
          >
            Ouvrir un salon
          </button>
          <button
            type="button"
            className={tab === "join" ? "primary" : ""}
            onClick={() => setTab("join")}
          >
            Rejoindre
          </button>
          <button
            type="button"
            className={tab === "grains" ? "primary" : ""}
            onClick={() => setTab("grains")}
          >
            Mes graines
          </button>
        </div>

        {error && (
          <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>{error}</p>
        )}

        {tab === "create" ? (
          <form onSubmit={handleCreate} suppressHydrationWarning>
            <p className="muted" style={{ marginBottom: "1rem" }}>
              Vous serez l&apos;admin — god mode inclus, ego en option.
            </p>

            <PlaceholderInput
              id="roomName"
              name="roomName"
              label="Nom du salon"
              suggestion={roomSuggestion}
              onRoll={() => setRoomSuggestion(randomRoomName())}
              value={roomValue}
              onChange={setRoomValue}
              diceTitle="Nouveau nom de taverne"
            />

            <PlaceholderInput
              id="adminName"
              name="adminName"
              label="Votre nom de MJ / hôte"
              suggestion={adminSuggestion}
              onRoll={() => setAdminSuggestion(randomPlayerName())}
              value={adminValue}
              onChange={setAdminValue}
              diceTitle="Nouvelle identité héroïque"
            />

            <div className="form-actions-row">
              <button type="submit" className="primary" disabled={loading}>
                {loading ? "Invocation…" : "Créer le salon"}
              </button>
              <button
                type="button"
                className="dice-btn dice-btn-wide"
                title="Tout re-randomiser (salon + hôte)"
                onClick={rollAllCreate}
              >
                🎲 Tout relancer
              </button>
            </div>
          </form>
        ) : tab === "join" ? (
          <form onSubmit={handleJoin} suppressHydrationWarning>
            <div style={{ marginBottom: "1rem" }}>
              <label htmlFor="code">Code du salon</label>
              <input
                id="code"
                name="code"
                required
                maxLength={6}
                placeholder="ABC123"
                style={{ textTransform: "uppercase" }}
                suppressHydrationWarning
              />
            </div>

            <PlaceholderInput
              id="playerName"
              name="playerName"
              label="Nom du personnage"
              suggestion={joinPlayerSuggestion}
              onRoll={() => setJoinPlayerSuggestion(randomPlayerName())}
              value={joinPlayerValue}
              onChange={setJoinPlayerValue}
            />

            <button type="submit" className="primary" disabled={loading}>
              {loading ? "Entrée en scène…" : "Entrer"}
            </button>
          </form>
        ) : (
          <div className="grains-panel">
            <p className="muted" style={{ marginBottom: "1rem" }}>
              Vos campagnes visitées sur cet appareil. Reprendre restaure votre
              identité ; les chroniques .md vivent sur le serveur.
            </p>
            {!grains.length ? (
              <p className="muted">
                Aucune graine mémorisée — créez ou rejoignez une table, puis quittez
                avec « Sauvegarder et quitter ».
              </p>
            ) : (
              <ul className="grains-list">
                {grains.map((g) => {
                  const meta = grainMeta[g.roomCode.toUpperCase()];
                  return (
                    <li key={`${g.roomCode}-${g.playerId}`} className="grain-item">
                      <div className="grain-main">
                        <strong>{g.roomName}</strong>
                        <span className="muted">
                          {" "}
                          · {g.roomCode} · {g.playerName}
                        </span>
                        <div className="muted grain-meta">
                          Dernière activité :{" "}
                          {formatActivity(meta?.lastActivityAt ?? g.lastVisitedAt)}
                          {meta?.hasExport ? " · 📜 export .md" : ""}
                        </div>
                      </div>
                      <div className="grain-actions">
                        <button
                          type="button"
                          className="primary"
                          onClick={() => resumeGrain(g)}
                        >
                          Reprendre
                        </button>
                        <button
                          type="button"
                          title="Retirer de cette tablette"
                          onClick={() => forgetGrain(g)}
                        >
                          Oublier
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
