"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "@/components/AuthProvider";

const HomePageContent = dynamic(
  () =>
    import("@/components/HomePageContent").then((m) => m.HomePageContent),
  {
    ssr: false,
    loading: () => (
      <main className="layout">
        <header className="hero">
          <h1>RPG-CR</h1>
          <p className="tagline muted">Chargement…</p>
        </header>
      </main>
    ),
  }
);

/** Accueil sans SSR — évite mismatch hydratation (attributs injectés sur les inputs). */
export function HomePageClient() {
  return (
    <AuthProvider>
      <HomePageContent />
    </AuthProvider>
  );
}
