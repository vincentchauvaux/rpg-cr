import { NextRequest } from "next/server";
import { getBasePath } from "@/lib/config";

export { authBasePath } from "@/lib/auth-path";

/**
 * Next.js retire basePath (/rpg-cr) avant le handler — Auth.js v5 attend le chemin complet.
 * @see https://github.com/nextauthjs/next-auth/issues/13034
 */
export function injectAuthBasePath(req: NextRequest, fullAuthBase: string): NextRequest {
  const bp = getBasePath();
  if (!bp) return req;

  const url = new URL(req.url);
  if (url.pathname.startsWith(fullAuthBase)) return req;

  url.pathname = `${bp}${url.pathname}`;
  return new NextRequest(url, req);
}
