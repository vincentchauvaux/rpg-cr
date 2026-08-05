"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { withBasePath } from "@/lib/config";

const STORAGE_KEY = "rpg-cr-cookie-notice-dismissed";

/** Information CNIL : cookies Auth.js strictement nécessaires — pas de tracking. */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="cookie-notice" role="dialog" aria-label="Information cookies">
      <p>
        RPG-CR utilise des{" "}
        <strong>cookies de session strictement nécessaires</strong> pour la
        connexion Google (Auth.js). Aucun cookie publicitaire ni mesure
        d&apos;audience tierce.{" "}
        <Link href={withBasePath("/confidentialite/")}>
          Politique de confidentialité
        </Link>
      </p>
      <button type="button" className="primary" onClick={dismiss}>
        Compris
      </button>
    </div>
  );
}
