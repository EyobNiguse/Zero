import config from './packages/eslint-config/eslint.config.mjs';

export default [
  ...config,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
  },
];
