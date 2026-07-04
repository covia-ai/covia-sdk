// Flat ESLint config (ESLint 10 + typescript-eslint 8).
//
// Type-aware linting (`recommendedTypeChecked`) on the shipped SDK source — it
// catches the bugs that matter for a library: floating promises, unsafe `any`
// flow, misused awaits. Tests relax the unsafe-`any` rules because mocks are
// intentionally loose. `src/example.ts` is a sample, not shipped, so it's
// ignored here.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/example.ts'],
  },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // This SDK is a dynamic API client. Explicit `any` at request/response
      // boundaries is intentional and flexible, so `no-explicit-any` is off.
      '@typescript-eslint/no-explicit-any': 'off',
      // The `no-unsafe-*` family fires where response `any` flows into typed
      // code — the dynamic wire edges. Surfaced as warnings (visible, tightened
      // incrementally) rather than blocking: the typed result models are the
      // consumer-facing contract, and forcing `unknown` everywhere would push
      // casts onto every caller without runtime validation to back them.
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      // Preserve the repo's `_`-prefix convention for intentionally-unused
      // params/vars/catch bindings.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests: mocks and fixtures are deliberately dynamic.
    files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
    },
  },
);
