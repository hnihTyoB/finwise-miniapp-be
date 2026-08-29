import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      '.wrangler/**/*',
      'scripts/**/*',
      'prisma/**/*',
      'eslint.config.mjs',
      'jest.config.ts',
      'tests/**/*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-namespace': 'off',
      'no-console': 'off',
      'no-undef': 'off', // TypeScript compiler already checks undefined variables
    },
  }
);
