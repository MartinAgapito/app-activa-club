// Entidad de auditoría administrativa (RN-ADM, ADR-0008).
// Alineado con docs/data/diccionario-de-datos.md.

import type { ISODateString, Role } from './common';

export type AuditAction =
  | 'MEMBER_APPROVED'
  | 'MEMBER_REJECTED'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_APPROVED'
  | 'RESERVATION_REJECTED'
  | 'RESERVATION_CANCELLED'
  | 'RESOURCE_UPDATED'
  | 'RESOURCE_MAINTENANCE'
  | 'NOTIFICATION_SENT'
  | 'MIGRATION_RUN';

/**
 * Rol del actor de una acción auditada: un rol de aplicación o `system` para
 * procesos sin identidad Cognito (carga inicial por invocación directa de
 * Lambda, ADR-0012).
 */
export type AuditActorRole = Role | 'system';

/** Registro de auditoría de una acción administrativa (entidad AuditLog). */
export interface AuditLog {
  auditId: string;
  actorId: string;
  actorRole: AuditActorRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  timestamp: ISODateString;
}
