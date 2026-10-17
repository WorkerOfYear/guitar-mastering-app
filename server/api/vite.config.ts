// Bundles server/api/main.ts with its routes into dist-api/api.js (no app plugins, no public/).
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: { ssr: true, rolldownOptions: { input: { api: "server/api/main.ts" } }, outDir: "dist-api", emptyOutDir: true, target: "node22" },
});
