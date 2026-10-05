import js from '@eslint/js';
import globals from 'globals';
import * as tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-plugin-prettier';

export default defineConfig([
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    plugins: { js },
    extends: ['js/recommended'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: { globals: globals.browser },
  },
  ...tseslint.configs.recommended,
  // Next.js app config
  // {
  //   files: ['apps/worldbuilder/src/**/*.{js,ts,tsx}'],
  //   extends: ['next/core-web-vitals'],
  // },
  // Fastify app config
  // {
  //   files: ['apps/watcher/src/**/*.{js,ts}'],
  //   extends: ['plugin:node/recommended'],
  // },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Note: there should be no other properties in this object
    ignores: [
      '**/coverage',
      '**/.next',
      '**/public',
      '**/dist',
      '**/.vercel',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
    ],
  },
  {
    plugins: {
      prettier: prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
    },
  },
]);
