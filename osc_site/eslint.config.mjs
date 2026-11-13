/**
 * ESLint flat config osc_site.
 *
 * `eslint-config-next` tidak dipakai langsung karena config helper
 * `typescript-eslint` memvalidasi versi TS secara kaku saat import;
 * plugin Next/React dimuat eksplisit di sini dengan parser TS yang sama.
 * Type-safety penuh tetap dijaga `tsc --noEmit` (strict).
 */

import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import nextPlugin from '@next/eslint-plugin-next'
import reactHooks from 'eslint-plugin-react-hooks'

const eslintConfig = [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'next-env.d.ts'],
  },
  {
    files: ['**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser + Node (route handler runtime nodejs)
        console: 'readonly',
        process: 'readonly',
        fetch: 'readonly',
        document: 'readonly',
        window: 'readonly',
        setTimeout: 'readonly',
        FormData: 'readonly',
        XMLHttpRequest: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
    },
  },
]

export default eslintConfig
