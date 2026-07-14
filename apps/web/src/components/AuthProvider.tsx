"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AUTH_PUBLIC_BASE_PATH } from "@/auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider basePath={AUTH_PUBLIC_BASE_PATH}>{children}</SessionProvider>;
}
