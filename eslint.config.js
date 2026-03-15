import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      // Unused vars: error in src, but allow _-prefixed ignores
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Warn on explicit any rather than error — codebase uses it intentionally
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow non-null assertions
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Allow require imports (CommonJS interop)
      '@typescript-eslint/no-require-imports': 'off',
      // React hooks rules (plugin installed)
      'react-hooks/exhaustive-deps': 'warn',
      // Turn off noisy builtins that produce false positives in this codebase
      'preserve-caught-error': 'off',
      'no-useless-assignment': 'off',
      'no-control-regex': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    // Test files: relax unused-vars to warn (many intentional unused imports)
    files: ['src/tests/**/*.ts', 'src/tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
