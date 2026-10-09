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
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
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
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
          // PNGs for systems that don't take SVG icons (iOS home screen, older Android launchers).
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      // The content packs make the app bundle large; it still has to work offline.
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
    }),
  ],
  server: { fs: { allow: ["../.."] } },
});
