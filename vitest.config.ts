import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Include .test.tsx too — component render tests must not be silently skipped.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
