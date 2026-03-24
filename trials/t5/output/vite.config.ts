import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3005,
  },
  optimizeDeps: {
    exclude: ['autk-db', 'autk-map'],
  },
});
