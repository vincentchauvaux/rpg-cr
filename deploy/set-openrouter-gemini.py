#!/usr/bin/env python3
"""Met à jour le .env VPS : MJ Gemini Flash via OpenRouter, Groq en secours.

La clé OpenRouter est lue sur stdin (une ligne), jamais affichée.
Usage (sur le VPS) :
  printf '%s\\n' "$OPENROUTER_API_KEY" | python3 deploy/set-openrouter-gemini.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = Path("/root/rpg-cr/.env") if Path("/root/rpg-cr/.env").exists() else ROOT / ".env"


def upsert(lines: list[str], wanted: dict[str, str]) -> list[str]:
    found: set[str] = set()
    out: list[str] = []
    for line in lines:
        raw = line.strip()
        replaced = False
        for key, value in wanted.items():
            if raw.startswith(f"{key}=") or raw.startswith(f"#{key}="):
                out.append(f"{key}={value}")
                found.add(key)
                replaced = True
                break
        if not replaced:
            out.append(line)
    if out and out[-1] != "":
        out.append("")
    for key, value in wanted.items():
        if key not in found:
            out.append(f"{key}={value}")
    return out


def main() -> int:
    key = sys.stdin.readline().rstrip("\n").strip()
    if not key.startswith("sk-or-"):
        print("expected OpenRouter key on stdin", file=sys.stderr)
        return 1
    if not ENV_PATH.exists():
        print(f"missing {ENV_PATH}", file=sys.stderr)
        return 1
    wanted = {
        "AI_PROVIDER": "openrouter",
        "AI_MODEL": "google/gemini-3.8-flash",
        "AI_FALLBACK_PROVIDER": "groq",
        "OPENROUTER_HTTP_REFERER": "https://vps-e09ed6db.vps.ovh.net/rpg-cr",
        "OPENROUTER_API_KEY": key,
    }
    text = ENV_PATH.read_text()
    updated = upsert(text.splitlines(), wanted)
    ENV_PATH.write_text("\n".join(updated) + "\n")
    print("env-updated")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
