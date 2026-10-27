import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// One flat config for both workspaces. React rules are scoped to web/ only.
export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['web/**/*.{ts,tsx}'],
    extends: [
      // jsx-runtime variant: the project uses the automatic JSX transform
      // (no `import React` needed), so the plugin skips scope-related rules.
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat['recommended-latest'],
    ],
    settings: { react: { version: 'detect' } },
  },
  // Must come last: disables stylistic rules that Prettier owns.
  prettier,
);
