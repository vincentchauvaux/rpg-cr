"use client";

import dynamic from "next/dynamic";

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

export function SalonRoomClient({ code }: { code: string }) {
  return <RoomView code={code} />;
}
