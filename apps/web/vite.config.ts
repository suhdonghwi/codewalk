import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  server: {
    // Vite rejects unknown Host headers. Raw IPs always pass; Tailscale MagicDNS
    // names (machine.tailnet.ts.net) need to be allowed explicitly.
    allowedHosts: [".ts.net"],
    fs: {
      allow: [new URL("../..", import.meta.url).pathname],
    },
    proxy: {
      "/api": "http://127.0.0.1:3001",
    },
  },
});
