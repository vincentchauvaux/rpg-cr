import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rpg-cr/shared"],
  // Accès LAN en dev (ex. http://192.168.0.210:3000) sans erreurs _next cross-origin
  allowedDevOrigins: ["192.168.0.210", "localhost", "127.0.0.1"],
};

export default nextConfig;
