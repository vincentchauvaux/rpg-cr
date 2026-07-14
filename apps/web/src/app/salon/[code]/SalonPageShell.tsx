"use client";

import { AuthProvider } from "@/components/AuthProvider";
import { SalonRoomClient } from "./SalonRoomClient";

/** AuthProvider requis pour useAppUserId (join invité) — comme l'accueil. */
export function SalonPageShell({ code }: { code: string }) {
  return (
    <AuthProvider>
      <SalonRoomClient code={code} />
    </AuthProvider>
  );
}
