import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RPG-CR — Salon JDR",
  description: "Salons de jeu de rôle en ligne, guidés par un MJ IA",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
