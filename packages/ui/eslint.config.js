// ESLint de @activa-club/ui: extiende la configuración raíz del monorepo y
// añade reglas de React Hooks para los componentes de la design foundation.
// Ver el comentario en la raíz (`../../eslint.config.js`) sobre este mecanismo
// de extensión por paquete.
import reactHooks from 'eslint-plugin-react-hooks';
import rootConfig from '../../eslint.config.js';

export default [
  ...rootConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
