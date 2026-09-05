// ESLint for the customer and admin React apps. Added 2026-09-05 as a
// non-blocking check: CI runs it with continue-on-error so it cannot stop a
// deploy, but the report shows undefined variables, unused imports and
// broken hook dependency lists before they reach production. Tighten rules
// to "error" only after the existing warnings are worked off.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      // Real bugs: keep as errors.
      'no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Hygiene: warnings until the backlog is cleared. 'React' stays imported
      // by convention although the automatic JSX runtime no longer needs it;
      // unused catch parameters are fine.
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_|^React$' }],
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler-era advisories (plugin v7). Useful signal, but this is
      // a React 18 app without the compiler, so they stay advisory.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
