import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

// eslint-config-next v15 ships eslintrc-format configs, not flat-config arrays, so they
// are bridged through FlatCompat. (The create-next-app scaffold imported them directly,
// which assumes v16 and fails with "nextVitals is not iterable".)
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // A leading underscore is this codebase's marker for a deliberately unused
      // binding (discarded rest properties, signature-only parameters).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  { ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts'] },
];

export default eslintConfig;
