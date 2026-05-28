"use client";

import { useEffect, useState } from "react";
import { randomPlayerName, randomRoomName } from "@/lib/random-names";

/** Suggestions aléatoires générées uniquement côté client (pas de Math.random au SSR). */
export function useRandomCreateSuggestions() {
  const [roomSuggestion, setRoomSuggestion] = useState("");
  const [adminSuggestion, setAdminSuggestion] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRoomSuggestion(randomRoomName());
    setAdminSuggestion(randomPlayerName());
    setReady(true);
  }, []);

  return {
    roomSuggestion,
    setRoomSuggestion,
    adminSuggestion,
    setAdminSuggestion,
    ready,
  };
}

export function useRandomJoinPlayerSuggestion() {
  const [joinPlayerSuggestion, setJoinPlayerSuggestion] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setJoinPlayerSuggestion(randomPlayerName());
    setReady(true);
  }, []);

  return { joinPlayerSuggestion, setJoinPlayerSuggestion, ready };
}
