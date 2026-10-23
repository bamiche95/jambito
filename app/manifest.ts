import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    /*
     * `id` pins the install's identity to the origin's root. Without it the
     * browser derives one from `start_url`, so changing `start_url` later
     * (or serving from a different base path) installs a *second* app instead
     * of updating the existing one.
     */
    id: "/",
    name: "CBT-Practice — JAMB, WAEC & POST UTME Practice",
    short_name: "CBT-Practice",
    description:
      "Offline-first past questions practice for Nigerian students preparing for JAMB, WAEC and POST UTME.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Sampled from the badge artwork (#1E2639). The generated icons share this
    // exact tone, so the launch splash and the icon blend into one surface.
    background_color: "#1e2639",
    theme_color: "#1e2639",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
