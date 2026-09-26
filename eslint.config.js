import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Import rules that keep the layers honest (see README → Architecture). */
const layer = (files, forbidden, message) => ({
  files,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map(dir => ({ group: [`**/${dir}/**`], message })),
      },
    ],
  },
});

export default defineConfig(
  globalIgnores(['dist', 'coverage']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
  layer(
    ['src/core/**'],
    ['cli', 'renderers', 'infra', 'providers/open-meteo'],
    'core holds the domain and use cases; it must not know how data is fetched or shown.'
  ),
  layer(
    ['src/providers/**'],
    ['cli', 'renderers'],
    'providers map external APIs to domain models; they never render.'
  ),
  layer(
    ['src/renderers/**'],
    ['cli', 'infra', 'providers'],
    'renderers turn domain models into text; they never fetch or know the API.'
  ),
  layer(
    ['src/infra/**'],
    ['cli', 'renderers', 'providers'],
    'infra is plumbing (HTTP, files); it must not depend on features.'
  ),
  {
    files: ['tests/**', 'scripts/**'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
  }
);
