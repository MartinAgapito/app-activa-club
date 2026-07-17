/// <reference types="vite/client" />

// Variables de entorno del frontend (ver .env.example en la raíz del monorepo).
// Ninguna de estas variables es un secreto: el backend nunca expone claves
// privadas de Cognito/Culqi al cliente (RN-PAG-08).
interface ImportMetaEnv {
  /** Base URL de la API (prefijo /api), ver docs/api/contratos-api.md §1. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  /** Región de Cognito; opcional — por defecto se deriva del prefijo de
   * VITE_COGNITO_USER_POOL_ID (formato "<región>_<id>"), ver auth/cognito-client.ts. */
  readonly VITE_COGNITO_REGION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
