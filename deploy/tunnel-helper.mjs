#!/usr/bin/env node
/**
 * Assistant local Mac — permet au navigateur (VPS /rpg-cr) de démarrer le tunnel SSH.
 * Usage : npm run tunnel:helper   (laisser tourner en arrière-plan)
 *
 * Écoute http://127.0.0.1:17434 — CORS + Private Network Access pour requêtes depuis le VPS.
 */

import http from "node:http";
import { spawn, execSync } from "node:child_process";

const PORT = Number(process.env.TUNNEL_HELPER_PORT ?? 17434);
const VPS_HOST = process.env.VPS_HOST ?? "root@vps-e09ed6db.vps.ovh.net";
const LOCAL_LM_PORT = process.env.LOCAL_LM_PORT ?? "1234";
const REMOTE_BIND_PORT = process.env.REMOTE_BIND_PORT ?? "1234";

let tunnelChild = null;

function tunnelPidsOnMac() {
  try {
    const out = execSync(
      `pgrep -f "ssh -N.*-R ${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_LM_PORT}" 2>/dev/null || true`,
      { encoding: "utf8" }
    );
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
}

function isTunnelRunning() {
  if (tunnelChild && !tunnelChild.killed) return true;
  return tunnelPidsOnMac().length > 0;
}

function startTunnel() {
  if (isTunnelRunning()) {
    return { ok: true, already: true };
  }

  const args = [
    "-N",
    "-o",
    "ServerAliveInterval=60",
    "-o",
    "ServerAliveCountMax=3",
    "-R",
    `${REMOTE_BIND_PORT}:127.0.0.1:${LOCAL_LM_PORT}`,
    VPS_HOST,
  ];

  tunnelChild = spawn("ssh", args, {
    stdio: "ignore",
    detached: true,
  });
  tunnelChild.unref();

  tunnelChild.on("exit", () => {
    tunnelChild = null;
  });

  return { ok: true, already: false, pid: tunnelChild.pid };
}

function setCors(req, res) {
  const origin = req.headers.origin ?? "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}

const server = http.createServer((req, res) => {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, running: isTunnelRunning() }));
    return;
  }

  if (req.url === "/start" && req.method === "POST") {
    try {
      const result = startTunnel();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : "start failed",
        })
      );
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`RPG-CR tunnel helper → http://127.0.0.1:${PORT}`);
  console.log("POST /start — démarre le tunnel SSH vers le VPS");
  console.log("Laissez ce processus actif pendant vos parties (Mac).");
});
