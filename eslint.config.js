import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "src-tauri", "test-results", "playwright-report"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          // An expression body returns its value as the cleanup. Newer Chromium
          // (WebView2) returns a Promise from scrollTo, which broke the diff sheet.
          selector:
            "CallExpression[callee.name=/^use(Layout|Insertion)?Effect$/] > ArrowFunctionExpression[body.type!='BlockStatement']",
          message: "Give effect callbacks a block body: an expression body is returned as the cleanup.",
        },
      ],
    },
  },
  // Playwright fixtures call `use`, which is not React's hook.
  { files: ["e2e/**"], rules: { "react-hooks/rules-of-hooks": "off" } },
);
