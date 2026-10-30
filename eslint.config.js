import js from '@eslint/js';
import globals from 'globals';
export default [
  { ignores: ['node_modules/**', 'dist/**', 'render/**'] },
  js.configs.recommended,
  { languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs' } },
  { files: ['desktop/ui/**', 'web/**'], languageOptions: { sourceType: 'script', globals: { ...globals.browser } } },
];
