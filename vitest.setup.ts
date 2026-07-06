import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Unmount components rendered by @testing-library/react between tests so DOM
// does not leak across cases.
afterEach(() => {
  cleanup();
});
