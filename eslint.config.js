import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/prisma/migrations/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: [
      "apps/api/**/*.ts",
      "apps/worker/**/*.ts",
      "*.config.{js,ts}",
      "packages/tracker/scripts/*.mjs",
      "packages/tracker/demo/server.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["loadtest/*.js"],
    languageOptions: { globals: { __ENV: "readonly", __VU: "readonly" } },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}", "packages/tracker/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  prettier,
);
