// Entidad de auditoría administrativa (RN-ADM, ADR-0008).
// Alineado con docs/data/diccionario-de-datos.md.

import type { ISODateString, Role } from './common';

export type AuditAction =
  | 'MEMBER_APPROVED'
  | 'MEMBER_REJECTED'
  | 'RESERVATION_APPROVED'
  | 'RESERVATION_REJECTED'
  | 'RESOURCE_UPDATED'
  | 'RESOURCE_MAINTENANCE'
  | 'NOTIFICATION_SENT'
  | 'MIGRATION_RUN';

/** Registro de auditoría de una acción administrativa (entidad AuditLog). */
export interface AuditLog {
  auditId: string;
  actorId: string;
  actorRole: Role;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  timestamp: ISODateString;
}
