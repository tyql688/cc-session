import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solidPlugin from "eslint-plugin-solid";
import prettier from "eslint-config-prettier";

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
  prettier,
);
