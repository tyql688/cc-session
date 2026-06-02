import { afterEach } from "vitest";
import { cleanup } from "@solidjs/testing-library";
import "@testing-library/jest-dom/vitest";

// Unmount any components rendered by @solidjs/testing-library's `render`
// between tests so DOM and Solid roots do not leak across cases.
afterEach(() => {
  cleanup();
});
