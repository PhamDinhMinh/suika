import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public/frame.html'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      // v7 để bản flat trong configs.flat; configs['recommended-latest'] vẫn là dạng eslintrc cũ.
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
      // Tắt các luật va chạm với Prettier — để Prettier lo phần định dạng.
      prettier,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // File cấu hình chạy bằng Node, không nằm trong tsconfig của app.
  {
    files: ['*.config.{js,ts}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
);
