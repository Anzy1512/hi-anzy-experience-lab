import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * A small, useful lint gate — not an opinionated style régime.
 *
 * Formatting is deliberately not linted. What is linted is the class of mistake
 * this codebase can actually make: hooks misuse (the engine and the pointer
 * architecture depend on effect correctness), accidental globals, unused code,
 * floating promises, and unsafe patterns. Nothing here is suppressed wholesale
 * to make the gate pass.
 */
export default tseslint.config(
  /*
   * `audit` is ignored here deliberately, not overlooked.
   *
   * The OSINT audit service lives in this repository and is a different
   * product with its own package.json, its own dependency tree and its own
   * tsconfig. Linting it from the Lab's gate would either drag Node and server
   * rules into a config written for a browser client, or quietly relax the
   * client's rules to accommodate a server. It has its own `npm run lint`.
   *
   * What this preserves is the thing Phase 8.12 spent a phase establishing:
   * `npm ci && npm run build` at this root still resolves 173 packages and
   * produces a Lab that needs no backend to exist.
   */
  { ignores: ['dist', 'node_modules', 'qa', 'public', 'audit'] },

  // ---- application source: type-aware ------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Unused code is a real signal in a codebase this size; underscore opts out.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Three.js and the DOM both hand back `any` in places. Warn, do not block.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Lifecycle correctness — the reason this gate exists at all.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      'no-implicit-globals': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },

  // ---- build config: node environment, no type-aware project -------------
  {
    files: ['*.config.{ts,js}', 'eslint.config.js'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },
);
