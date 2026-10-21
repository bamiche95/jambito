import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Loaded with plain `require()` at runtime instead of being bundled: both
  // packages ship Node-only transports/crypto and are happier resolving their
  // own internals from node_modules. `nodemailer` backs the contact + welcome
  // mail, `firebase-admin` backs token verification.
  serverExternalPackages: ["firebase-admin", "nodemailer"],
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

