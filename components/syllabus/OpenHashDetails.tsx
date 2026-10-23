"use client";

import { useEffect } from "react";

/**
 * Opens the `<details>` element that matches the URL hash.
 *
 * The subject page uses native `<details>` accordions (no JavaScript needed to
 * study), but the browser cannot expand them from `#section-slug` on its own.
 * This tiny island fixes deep links: Google sitelinks, the sticky section index
 * and shared `#topic` links all land with the right accordion already open.
 */
export default function OpenHashDetails() {
  useEffect(() => {
    function openFromHash() {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) return;

      const target = document.getElementById(id);
      if (!target) return;

      let node: HTMLElement | null = target;
      while (node) {
        if (node instanceof HTMLDetailsElement) node.open = true;
        node = node.parentElement;
      }

      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  return null;
}
