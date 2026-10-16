import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { build as esbuild } from "esbuild";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// BASE_PATH is "/dnd-companion/" on GitHub Pages, "/" locally.
const base = process.env.BASE_PATH ?? "/";

/**
 * The app's own content packs, checked against the schema here, once, when the
 * app is built (and in dev). The app gets exactly what the check returns, so
 * phones don't check the same packs again at every start (about a third of
 * start-up time). Book text loaded on a device is still checked there.
 */
function contentPacks(): Plugin {
  const id = "virtual:content-packs";
  const packsDir = fileURLToPath(new URL("../../content/packs/", import.meta.url));
  return {
    name: "content-packs",
    resolveId: (source) => (source === id ? "\0" + id : undefined),
    async load(source) {
      if (source !== "\0" + id) return undefined;
      // The schema and registry are TypeScript in the workspace: bundled here so Node can run the check.
      const bundled = await esbuild({
        stdin: { contents: `export { ContentPack } from "./schema/src/index.ts"; export { ContentRegistry } from "./engine/src/registry.ts";`, resolveDir: fileURLToPath(new URL("..", import.meta.url)), loader: "ts" },
        bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
      });
      const { ContentPack, ContentRegistry } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0]!.text).toString("base64"));
      const packs = ["srd-5.1", "table-2014"].map((dir) => {
        const read = (f: string) => {
          this.addWatchFile(packsDir + dir + "/" + f);
          return JSON.parse(readFileSync(packsDir + dir + "/" + f, "utf8"));
        };
        const parts = readdirSync(packsDir + dir).filter((f) => f.endsWith(".json") && f !== "pack.json").sort().map(read);
        return ContentPack.parse(ContentRegistry.mergePack(read("pack.json"), parts));
      });
      return `export default ${JSON.stringify(packs)};`;
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    contentPacks(),
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
      // 3D dice (public/dice-box) aren't precached: they load only when switched on, then stay cached for offline use.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        globIgnores: ["dice-box/**"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [{ urlPattern: ({ url }) => url.pathname.includes("/dice-box/"), handler: "CacheFirst", options: { cacheName: "dice-box" } }],
      },
    }),
  ],
  server: { fs: { allow: ["../.."] } },
});
