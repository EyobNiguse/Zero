import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import baseConfig from "@zero/eslint-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: resolve(__dirname, "./tsconfig.json"),
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: resolve(__dirname, "./tsconfig.json"),
        },
      },
    },
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
