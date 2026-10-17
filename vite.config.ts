import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { alphaTab } from "@coderline/alphatab-vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), alphaTab()],
  resolve: { alias: { "@": "/src" } },
  // `npm run dev` talks to a locally running API (server/api, port 8789).
  server: { proxy: { "/api": "http://127.0.0.1:8789" } },
  test: { environment: "node", include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
