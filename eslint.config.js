// Configuración raíz de ESLint para todo el monorepo Activa Club.
// Cada app/paquete puede extender o añadir reglas específicas creando su propio
// eslint.config.js que importe y combine este arreglo (ver docs/architecture si aplica).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.terraform/**',
      '**/*.tfstate*',
      'infrastructure/terraform/**/*.tf',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Prettier debe ir siempre al final para desactivar reglas de estilo en conflicto.
  eslintConfigPrettier,
);
