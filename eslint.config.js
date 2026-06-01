import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solidPlugin from "eslint-plugin-solid";

// Formatting is owned by Biome (biome.json); ESLint keeps only typescript-eslint
// correctness rules + eslint-plugin-solid reactivity rules that Biome cannot
// replicate. No formatting rules are enabled here, so there is nothing for an
// eslint-config-prettier-style disabler to turn off.
export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "src-tauri/", ".reference/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ...solidPlugin.configs["flat/typescript"],
    rules: {
      ...solidPlugin.configs["flat/typescript"].rules,
      // Most hits are false positives (event handler props on native elements, async effects)
      "solid/reactivity": "off",
      // Switch/case icon components and conditional rendering patterns are clearer with early returns
      "solid/components-return-once": "off",
    },
  },
);
