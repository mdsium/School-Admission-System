/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/classes": "http://localhost:5000",
      "/holds": "http://localhost:5000",
      "/me": "http://localhost:5000",
      "/health": "http://localhost:5000",
    },
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/setupTests.ts"] },
});
