import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// Configuración de Vite para @activa-club/web.
// - React + Fast Refresh.
// - Tailwind CSS v4 vía su plugin oficial de Vite (config CSS-first, ver
//   src/styles/theme.css y apps/web/docs/design-foundation.md).
// - Vitest + Testing Library para pruebas de componentes (jsdom).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    css: true,
  },
});
