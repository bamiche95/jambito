"use client";

import { useEffect } from "react";
import { Serwist } from "@serwist/window";

/**
 * Registers the Serwist service worker (built by `serwist build`).
 * We register manually via `@serwist/window` rather than `SerwistProvider`
 * to avoid the React Compiler runtime dependency.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const serwist = new Serwist("/sw.js", {
      type: "module",
      scope: "/",
    });
    serwist.register().catch(() => {
      // Registration can fail in development or unsupported contexts; ignore.
    });
  }, []);

  return null;
}
