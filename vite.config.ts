import { defineConfig } from "vite";

export default defineConfig({
  // Base path for asset URLs. Set VITE_BASE (e.g. /neon-wars/) when deployed
  // under a GitHub Pages subpath; defaults to root for local dev.
  base: process.env.VITE_BASE || "/",
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: "es2020",
    outDir: "dist",
  },
});
