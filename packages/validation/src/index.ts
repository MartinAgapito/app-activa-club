// Punto de entrada de @activa-club/validation.
//
// Esquemas Zod de validación de entrada para los contratos de docs/api/. Usados
// por formularios de `apps/web` (React Hook Form + Zod) y por la validación de
// entrada en `apps/api`. Ninguna regla crítica de negocio depende únicamente de
// esta validación: el backend revalida contra el estado (ver reglas-de-negocio).

export * from './common';
export * from './member';
export * from './payment';
export * from './reservation';
export * from './notification';
export * from './migration';
