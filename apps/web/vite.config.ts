import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    // The Worker (wrangler dev) serves /api locally; proxying keeps cookies same-origin like production.
    proxy: { "/api": { target: "http://localhost:8787", ws: true, changeOrigin: false } },
  },
});
