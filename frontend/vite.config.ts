import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// В dev фронт ходит в backend через прокси /api → :3001.
// В проде nginx проксирует /api на backend-контейнер (см. nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
      "/healthz": "http://localhost:3001",
    },
  },
});
