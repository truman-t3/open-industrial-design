import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'vendor/**'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['scripts/desktop/**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'scripts/**/*.mjs',
      'scripts/**/*.cjs',
      'packages/**/scripts/**/*.mjs',
      'apps/web/*.mjs',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
);
