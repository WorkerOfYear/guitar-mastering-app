// Bundles server/dev-stand/api.ts with the api/ functions it serves into dist-api/api.js (no app plugins, no public/).
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: { ssr: "server/dev-stand/api.ts", outDir: "dist-api", emptyOutDir: true, target: "node22" },
});
