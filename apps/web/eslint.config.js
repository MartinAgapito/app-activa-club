// ESLint de @activa-club/web: extiende la configuración raíz del monorepo y
// añade reglas de React Hooks / React Refresh para la SPA.
// Ver el comentario en la raíz (`../../eslint.config.js`) sobre este mecanismo
// de extensión por paquete.
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
];
