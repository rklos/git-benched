import tsConfig from '@rklos/eslint-config/typescript';
import vitestConfig from '@rklos/eslint-config/vitest';

export default [
  ...tsConfig,
  ...vitestConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ['out/**', 'node_modules/**'],
  },
];
