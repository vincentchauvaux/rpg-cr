import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { pickGoogleSubject } from "@rpg-cr/shared";
import { withBasePath } from "@/lib/config";
import { authBasePath } from "@/lib/auth-path";

/** Chemin Auth.js (inclut basePath Next en prod). */
export const AUTH_BASE_PATH = authBasePath();
/** Chemin public SessionProvider (identique). */
export const AUTH_PUBLIC_BASE_PATH = AUTH_BASE_PATH;

/** Délai avant de retenter la synchro du compte quand l'API n'a pas répondu. */
const SYNC_RETRY_MS = 60_000;

async function syncUserToApi(profile: {
  googleSub: string;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
}): Promise<string | null> {
  const secret = process.env.AUTH_INTERNAL_SECRET?.trim();
  const apiUrl =
    process.env.API_INTERNAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    "http://127.0.0.1:4000";
  if (!secret) {
    console.error("[auth] AUTH_INTERNAL_SECRET manquant — profil non synchronisé");
    return null;
  }
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/api/auth/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(profile),
    });
    if (!res.ok) {
      console.error("[auth] sync API", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { user?: { id: string } };
    return data.user?.id ?? null;
  } catch (e) {
    console.error("[auth] sync API failed", e);
    return null;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  basePath: AUTH_BASE_PATH,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      const googleSub = pickGoogleSubject([
        account?.provider === "google" ? account.providerAccountId : null,
        typeof profile?.sub === "string" ? profile.sub : null,
        token.googleSub as string | undefined,
      ]);
      if (googleSub) token.googleSub = googleSub;

      // La synchro ne tournait qu'à la connexion, et `token.sub` (UUID NextAuth)
      // a créé un 2e compte Gmail. On resynchronise une fois (accountMerged v2).
      const lastTryAt = Number(token.appUserSyncAt ?? 0);
      const retryDue = Date.now() - lastTryAt > SYNC_RETRY_MS;
      const signedIn = Boolean(account);
      if (
        googleSub &&
        (signedIn ||
          token.accountMerged !== "v2" ||
          (!token.appUserId && retryDue))
      ) {
        token.appUserSyncAt = Date.now();
        const appUserId = await syncUserToApi({
          googleSub,
          email: token.email ?? profile?.email ?? null,
          displayName:
            (token.name as string | undefined) ??
            (profile as { name?: string })?.name ??
            token.email ??
            "Joueur",
          avatarUrl: (token.picture as string | undefined) ?? null,
        });
        if (appUserId) {
          token.appUserId = appUserId;
          token.accountMerged = "v2";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.appUserId) {
        session.user.appUserId = String(token.appUserId);
      }
      return session;
    },
  },
  pages: {
    signIn: withBasePath("/"),
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      appUserId?: string;
    };
  }
}
