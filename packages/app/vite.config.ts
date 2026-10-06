import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH is "/dnd-companion/" on GitHub Pages, "/" locally.
const base = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Table Companion",
        short_name: "Companion",
        description: "Character sheet and table tools for D&D 5e (2014).",
        theme_color: "#141a26",
        background_color: "#141a26",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,woff,woff2}"] },
    }),
  ],
  server: { fs: { allow: ["../.."] } },
});
