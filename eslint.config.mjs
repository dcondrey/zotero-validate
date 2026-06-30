import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "node_modules/**",
      ".claude/**",
      "defaults/**",
      "build.js",
      "*.config.mjs",
      "*.config.ts",
    ],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "none",
          caughtErrors: "none",
          varsIgnorePattern: "^_",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
