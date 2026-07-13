// Punto de entrada de @activa-club/shared-types.
//
// Contratos y tipos compartidos entre `apps/web` y `apps/api`, derivados de
// docs/data/ (modelo DynamoDB, diccionario) y docs/api/ (contratos REST).
// No inventar tipos sin respaldo en la documentación aprobada.

export type * from './common';
export type * from './member';
export type * from './payment';
export type * from './reservation';
export type * from './notification';
export type * from './dashboard';
export type * from './audit';
export type * from './migration';
