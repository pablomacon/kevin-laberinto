import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
});
