import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { withBasePath } from "@/lib/config";

export const AUTH_BASE_PATH = "/api/auth";
/** Chemin public (navigateur) — inclut le basePath Next.js en prod. */
export const AUTH_PUBLIC_BASE_PATH = withBasePath("/api/auth");

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
      if (account?.provider === "google" && account.providerAccountId) {
        const appUserId = await syncUserToApi({
          googleSub: account.providerAccountId,
          email: token.email ?? profile?.email ?? null,
          displayName:
            (token.name as string | undefined) ??
            (profile as { name?: string })?.name ??
            token.email ??
            "Joueur",
          avatarUrl: (token.picture as string | undefined) ?? null,
        });
        if (appUserId) token.appUserId = appUserId;
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
