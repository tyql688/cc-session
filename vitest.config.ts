import { defineConfig } from "vitest/config";
import solidPlugin from "vite-plugin-solid";

// Two test projects so the harness for Solid component render tests
// (`*.test.tsx`, DOM + JSX) is fully isolated from the existing logic/store
// tests (`*.test.ts`, plain node env). The node project keeps its original
// behavior unchanged; only the component project loads vite-plugin-solid,
// happy-dom, and the Solid browser/development resolve conditions.
export default defineConfig({
  test: {
    projects: [
      {
        // Logic, store, and parser tests — unchanged from the original config.
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Solid component render tests — DOM + JSX.
        plugins: [solidPlugin()],
        // Solid ships separate browser/dev builds; pick them so JSX renders to
        // real DOM nodes under happy-dom instead of the SSR string path.
        resolve: {
          conditions: ["development", "browser"],
        },
        test: {
          name: "components",
          environment: "happy-dom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["./vitest.setup.ts"],
          // vite-plugin-solid externalizes solid-js by default under vitest,
          // which makes it resolve the server build (triggering "Client-only
          // API called on the server side"). Inline it so Vite transforms it
          // with the browser conditions above.
          server: {
            deps: {
              inline: [/solid-js/, /@solidjs\/testing-library/],
            },
          },
        },
      },
    ],
  },
});
