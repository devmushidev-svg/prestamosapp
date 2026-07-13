import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const viteAppBuild =
  process.env.VITE_APP_BUILD?.trim() ||
  `dev ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

export default defineConfig({
  define: {
    "import.meta.env.VITE_APP_BUILD": JSON.stringify(viteAppBuild),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Íconos (192/512/maskable/apple-touch) generados desde el SVG de marca.
      pwaAssets: { image: "public/favicon.svg" },
      manifest: {
        name: "MultiPréstamos — Gestión de préstamos",
        short_name: "MultiPréstamos",
        description: "Sistema de gestión de préstamos",
        lang: "es",
        theme_color: "#fff7ed",
        background_color: "#fff7ed",
        display: "standalone",
        start_url: "/",
        scope: "/",
      },
      workbox: {
        // SPA: rutas de cliente sirven index.html offline; los datos van directo a Supabase.
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 5173,
    // ponytail: dev-only, permite el host aleatorio del túnel trycloudflare
    allowedHosts: true,
  },
  preview: {
    port: 4173,
  },
});
