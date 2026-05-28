"use client";

import { useEffect, useState } from "react";

/** true après le premier paint client — évite lecture window/localStorage au SSR. */
export function useClientMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
