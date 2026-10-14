import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React plugin is required so Vite can transform JSX and enable Fast
// Refresh during development. The original project listed the plugin as a
// dependency but never provided a config file, so it was never applied.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
