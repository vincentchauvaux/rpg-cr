"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { listUserGrainsFromApi } from "@/lib/api";
import type { UserGrain } from "@rpg-cr/shared";

export function GoogleAuthPanel() {
  const { data: session, status } = useSession();
  const [grains, setGrains] = useState<UserGrain[]>([]);
  const appUserId = session?.user?.appUserId;

  useEffect(() => {
    if (!appUserId) {
      setGrains([]);
      return;
    }
    void listUserGrainsFromApi(appUserId)
      .then((data) => setGrains(data.grains))
      .catch(() => setGrains([]));
  }, [appUserId]);

  if (status === "loading") {
    return (
      <div className="auth-panel panel">
        <p className="muted" style={{ margin: 0 }}>
          Connexion…
        </p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="auth-panel panel">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Profil joueur</h2>
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Connectez-vous pour retrouver vos campagnes sur tous vos appareils et
          lancer automatiquement le tunnel MJ sur votre Mac.
        </p>
        <button
          type="button"
          className="primary auth-google-btn"
          onClick={() => void signIn("google")}
        >
          Se connecter avec Google
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel panel">
      <div className="auth-profile-row">
        {session.user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={session.user.image}
            alt=""
            className="auth-profile-avatar"
            width={40}
            height={40}
          />
        ) : (
          <span className="auth-profile-avatar auth-profile-avatar--placeholder" aria-hidden>
            👤
          </span>
        )}
        <div>
          <strong>{session.user.name ?? "Joueur"}</strong>
          {session.user.email && (
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              {session.user.email}
            </p>
          )}
        </div>
        <button type="button" className="auth-signout-btn" onClick={() => void signOut()}>
          Déconnexion
        </button>
      </div>
      {grains.length > 0 && (
        <p className="muted" style={{ marginTop: "0.75rem", marginBottom: 0, fontSize: "0.85rem" }}>
          {grains.length} campagne{grains.length > 1 ? "s" : ""} liée{grains.length > 1 ? "s" : ""} à
          ce compte (onglet Mes graines).
        </p>
      )}
    </div>
  );
}

export function useAppUserId(): string | undefined {
  const { data: session } = useSession();
  return session?.user?.appUserId;
}
