import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.turbo/**', '**/drizzle/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
