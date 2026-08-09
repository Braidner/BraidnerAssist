import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// В dev фронт ходит в backend через прокси /api → :3001.
// В проде nginx проксирует /api на backend-контейнер (см. nginx.conf).
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Pultra",
        short_name: "Pultra",
        description: "Personal life dashboard — self-hosted",
        theme_color: "#09090d",
        background_color: "#09090d",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // iOS treats an <a download> click as a navigation. Never let the SPA
        // navigation fallback replace API/Jellyfin responses with index.html.
        navigateFallbackDenylist: [/^\/api\//, /^\/jf(?:\/|$)/, /^\/healthz$/],
        runtimeCaching: [
          {
            // Original movie files can be tens of gigabytes. Stream them from
            // the backend only; cloning one into Cache Storage would corrupt
            // mobile downloads and quickly exhaust device storage.
            urlPattern: /^\/api\/media\/file\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^\/api\/poster/,
            handler: "CacheFirst",
            options: {
              cacheName: "poster-cache",
              cacheableResponse: { statuses: [0, 200] },
              expiration: {
                maxEntries: 2500,
                maxAgeSeconds: 90 * 24 * 60 * 60,
              },
            },
          },
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", networkTimeoutSeconds: 5 },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": "http://hermes.lan:3001",
      "/healthz": "http://hermes.lan:3001",
    },
  },
});
