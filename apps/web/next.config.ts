import type { NextConfig } from "next";

const basePath = (() => {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
  if (!raw || raw === "/") return "";
  return raw.startsWith("/") ? raw.replace(/\/$/, "") : `/${raw.replace(/\/$/, "")}`;
})();

const nextConfig: NextConfig = {
  transpilePackages: ["@rpg-cr/shared"],
  ...(basePath ? { basePath, trailingSlash: true } : {}),
  skipTrailingSlashRedirect: true,
  // Accès LAN en dev (ex. http://192.168.0.210:3000) sans erreurs _next cross-origin
  allowedDevOrigins: ["192.168.0.210", "localhost", "127.0.0.1"],
};

export default nextConfig;
