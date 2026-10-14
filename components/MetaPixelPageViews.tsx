"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackMeta } from "@/lib/metaPixel";

/**
 * Reports one PageView per client-side navigation.
 *
 * The base code (components/MetaPixel.tsx) sends the first PageView, but a
 * `beforeInteractive` script runs once per document load while an App Router
 * navigation swaps the page without reloading. Without this island a visitor who
 * lands on "/" and then opens five practice pages would be counted once, which
 * would make the pixel's numbers useless for judging which pages are worth
 * building.
 *
 * The first effect run is skipped on purpose: it belongs to the initial render,
 * whose PageView the base code has already sent. The guard is a ref rather than
 * state so that React's double-invoked effects in development cannot send a
 * second one.
 *
 * `trackMeta` no-ops when the pixel is switched off or has not loaded yet, so
 * this component needs no knowledge of either.
 */
export default function MetaPixelPageViews() {
  const pathname = usePathname();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    trackMeta("PageView");
  }, [pathname]);

  return null;
}
