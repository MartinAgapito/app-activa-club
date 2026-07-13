// DTOs de la migración on-premise (RN-MIG).
// Alineado con docs/data/mapeo-migracion.md.

import type { ISODateString } from './common';
import type { MembershipType } from './member';

/** Un socio dentro del JSON on-premise (contrato de entrada). */
export interface LegacyMembership {
  tipo: MembershipType;
  inicio: string;
  fin: string;
  estadoLegado: string;
}

export interface LegacyMember {
  legacyId: string;
  dni: string;
  nombres: string;
  apellidos: string;
  email: string;
  telefono?: string;
  membresia: LegacyMembership;
  /** Saldo pendiente en céntimos. */
  saldoPendiente: number;
}

export interface LegacyExport {
  version: string;
  exportedAt: ISODateString;
  socios: LegacyMember[];
}

export interface MigrationRejectedItem {
  index: number;
  reason: string;
}

/** Resumen de una ejecución de migración (contrato de salida). */
export interface MigrationResult {
  total: number;
  migrated: number;
  skipped: number;
  rejected: number;
  rejectedItems: MigrationRejectedItem[];
  runAt: ISODateString;
}
