import js from "@eslint/js";
import tseslint from "typescript-eslint";
import solidPlugin from "eslint-plugin-solid";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["node_modules/", "dist/", "src-tauri/", ".reference/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    ...solidPlugin.configs["flat/typescript"],
  },
  prettier,
);
