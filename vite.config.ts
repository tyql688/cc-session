import { readFileSync } from "node:fs";
import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageJson = JSON.parse(readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  // Build-time app version for the headless shell, where the Tauri app
  // plugin's getVersion() is unavailable.
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  // Lazy routes contain several large third-party modules. Scan all app
  // sources up front so discovering one later cannot invalidate in-flight
  // dynamic imports and force the Tauri webview through an error-boundary reload.
  optimizeDeps: {
    entries: ["src/**/*.{ts,tsx}", "!src/**/*.test.{ts,tsx}"],
  },
  plugins: [
    tailwindcss(),
    react(),
    // React Compiler moved out of @vitejs/plugin-react's options in v6.
    // Keep it as a separate, filtered Babel pass so only React-shaped modules
    // pay the transform cost.
    babel({ presets: [reactCompilerPreset()] }),
  ],
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1000,
  },
  clearScreen: false,
});
