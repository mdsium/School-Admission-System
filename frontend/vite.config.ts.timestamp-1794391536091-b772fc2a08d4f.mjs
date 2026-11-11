// vite.config.ts
import { defineConfig } from "file:///F:/School%20Admission%20System/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///F:/School%20Admission%20System/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/classes": "http://localhost:5000",
      "/holds": "http://localhost:5000",
      "/me": "http://localhost:5000",
      "/health": "http://localhost:5000"
    }
  },
  test: { environment: "jsdom", globals: true, setupFiles: ["./src/setupTests.ts"] }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJGOlxcXFxTY2hvb2wgQWRtaXNzaW9uIFN5c3RlbVxcXFxmcm9udGVuZFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRjpcXFxcU2Nob29sIEFkbWlzc2lvbiBTeXN0ZW1cXFxcZnJvbnRlbmRcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Y6L1NjaG9vbCUyMEFkbWlzc2lvbiUyMFN5c3RlbS9mcm9udGVuZC92aXRlLmNvbmZpZy50c1wiOy8vLyA8cmVmZXJlbmNlIHR5cGVzPVwidml0ZXN0XCIgLz5cbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0XCI7XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XG4gIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBob3N0OiB0cnVlLFxuICAgIHByb3h5OiB7XG4gICAgICBcIi9jbGFzc2VzXCI6IFwiaHR0cDovL2xvY2FsaG9zdDo1MDAwXCIsXG4gICAgICBcIi9ob2xkc1wiOiBcImh0dHA6Ly9sb2NhbGhvc3Q6NTAwMFwiLFxuICAgICAgXCIvbWVcIjogXCJodHRwOi8vbG9jYWxob3N0OjUwMDBcIixcbiAgICAgIFwiL2hlYWx0aFwiOiBcImh0dHA6Ly9sb2NhbGhvc3Q6NTAwMFwiLFxuICAgIH0sXG4gIH0sXG4gIHRlc3Q6IHsgZW52aXJvbm1lbnQ6IFwianNkb21cIiwgZ2xvYmFsczogdHJ1ZSwgc2V0dXBGaWxlczogW1wiLi9zcmMvc2V0dXBUZXN0cy50c1wiXSB9LFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQ0EsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxXQUFXO0FBRWxCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxFQUNqQixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTCxZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxXQUFXO0FBQUEsSUFDYjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU0sRUFBRSxhQUFhLFNBQVMsU0FBUyxNQUFNLFlBQVksQ0FBQyxxQkFBcUIsRUFBRTtBQUNuRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
