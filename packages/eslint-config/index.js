const path = require("path");

/** @type {import("eslint").Linter.Config} */
module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "next/core-web-vitals", 
    "plugin:@typescript-eslint/recommended",
  ],
  settings: {
    // This ensures import resolution works correctly across the monorepo
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  rules: {
    // Enforce type imports with error (not warning)
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
        disallowTypeAnnotations: true, // This makes non-type imports for types an error
      },
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: {
          attributes: false,
        },
      },
    ],
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  },
  overrides: [
    {
      // These rules are applied to .ts and .tsx files only
      files: ["*.ts", "*.tsx"],
      extends: ["plugin:@typescript-eslint/recommended-requiring-type-checking"],
      parserOptions: {
        project: "./tsconfig.json",
      },
      rules: {
        // Add additional TypeScript-specific rules here
        "@typescript-eslint/no-floating-promises": "error",
      },
    },
  ],
};
