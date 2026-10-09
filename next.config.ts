import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin"],
  images: {
    /*
     * TEMPORARY — remove once the hero artwork is a local file.
     *
     * The landing-page hero (components/home/Hero.tsx) currently renders a
     * placeholder illustration hosted at placehold.co, because the real artwork
     * has not been committed to public/images/ yet. `next/image` refuses to
     * optimise a remote host that is not allow-listed here.
     *
     * When public/images/hero-students.png lands and HERO_IMAGE.src in
     * components/home/heroImage.ts is pointed at it, delete this whole
     * `remotePatterns` entry — the block is inert otherwise.
     */
    remotePatterns: [
      { protocol: "https", hostname: "placehold.co", pathname: "/**" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "no-cache" },
          { key: "Content-Type", value: "application/manifest+json" },
        ],
      },
    ];
  },
};

export default nextConfig;

