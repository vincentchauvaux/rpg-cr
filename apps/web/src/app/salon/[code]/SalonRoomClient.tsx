"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  PlaceholderInput,
  resolvePlaceholderValue,
} from "@/components/PlaceholderInput";
import { useAppUserId } from "@/components/GoogleAuthPanel";
import { getRoom, joinRoom, linkPlayerToUserApi } from "@/lib/api";
import {
  findMostRecentGrainForRoom,
  rememberGrain,
  type GrainRecord,
} from "@/lib/grains";
import { randomPlayerName } from "@/lib/random-names";
import { loadSession, saveSession } from "@/lib/session";
import { useRandomJoinPlayerSuggestion } from "@/lib/use-random-suggestions";

const RoomView = dynamic(
  () => import("@/components/RoomView").then((m) => m.RoomView),
  {
    ssr: false,
    loading: () => (
      <main className="layout">
        <p className="muted">Chargement du salon…</p>
      </main>
    ),
  }
);

type GateState = "checking" | "join" | "ready";

function resumeGrainSession(g: GrainRecord, appUserId?: string): void {
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
}

export function SalonRoomClient({ code }: { code: string }) {
  const normalizedCode = code.toUpperCase();
  const appUserId = useAppUserId();
  const gateCheckedRef = useRef(false);
  const [gate, setGate] = useState<GateState>("checking");
  const [roomName, setRoomName] = useState<string | null>(null);
  const [roomMissing, setRoomMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { joinPlayerSuggestion, setJoinPlayerSuggestion } =
    useRandomJoinPlayerSuggestion();
  const [joinPlayerValue, setJoinPlayerValue] = useState("");

  useEffect(() => {
    if (gateCheckedRef.current) return;
    gateCheckedRef.current = true;

    const session = loadSession();
    if (session?.roomCode.toUpperCase() === normalizedCode) {
      setGate("ready");
      return;
    }

    const grain = findMostRecentGrainForRoom(normalizedCode);
    if (grain) {
      resumeGrainSession(grain, appUserId);
      setGate("ready");
      return;
    }

    void getRoom(normalizedCode)
      .then((data) => {
        setRoomName(data.room.name);
        setGate("join");
      })
      .catch(() => {
        setRoomMissing(true);
        setGate("join");
      });
  }, [normalizedCode, appUserId]);

  async function handleJoin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const playerName = resolvePlaceholderValue(
      joinPlayerValue,
      joinPlayerSuggestion
    );
    try {
      const { room } = await getRoom(normalizedCode);
      const { player } = await joinRoom(
        room.id,
        playerName,
        undefined,
        appUserId
      );
      saveSession({
        roomId: room.id,
        roomCode: room.code,
        playerId: player.id,
        playerName: player.name,
        role: player.role,
      });
      rememberGrain({
        roomId: room.id,
        roomCode: room.code,
        roomName: room.name,
        playerId: player.id,
        playerName: player.name,
        role: player.role,
      });
      setGate("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  if (gate === "checking") {
    return (
      <main className="layout">
        <p className="muted">Chargement du salon…</p>
      </main>
    );
  }

  if (gate === "join") {
    return (
      <main className="layout">
        <header className="hero">
          <h1>RPG-CR</h1>
          <p className="tagline">Vous avez été invité à une table.</p>
        </header>

        <div className="panel" style={{ maxWidth: 520, margin: "0 auto" }}>
          {roomMissing ? (
            <>
              <p style={{ color: "var(--danger)" }}>
                Salon « {normalizedCode} » introuvable — vérifiez le lien ou le
                code.
              </p>
              <p style={{ marginTop: "1rem" }}>
                <Link href="/">Retour à l&apos;accueil</Link>
              </p>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginBottom: "1rem" }}>
                {roomName ? (
                  <>
                    Table <strong>{roomName}</strong> — code{" "}
                    <strong>{normalizedCode}</strong>
                  </>
                ) : (
                  <>Code salon : <strong>{normalizedCode}</strong></>
                )}
              </p>

              {error && (
                <p style={{ color: "var(--danger)", marginBottom: "1rem" }}>
                  {error}
                </p>
              )}

              <form onSubmit={handleJoin} suppressHydrationWarning>
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
                  {loading ? "Entrée en scène…" : "Entrer dans le salon"}
                </button>
              </form>

              <p className="muted" style={{ marginTop: "1rem" }}>
                <Link href="/">Retour à l&apos;accueil</Link>
              </p>
            </>
          )}
        </div>
      </main>
    );
  }

  return <RoomView code={normalizedCode} />;
}
