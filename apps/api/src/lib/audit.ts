// Registro de auditoría administrativa (`AuditLog`, docs/data/modelo-dynamodb.md
// §3.14, ADR-0008): un único `PutItem` con PK=`AUDIT#<yyyy-mm-dd>` y
// SK=`<timestamp>#<auditId>` (patrón de acceso #10, consulta cronológica por
// día). Mismo patrón que `recordMigrationAudit` en `../migration/run.ts`;
// aquí se comparte como helper genérico para que otras acciones
// administrativas (aprobación/rechazo de socios, y las que sigan) no dupliquen
// la construcción del ítem.

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { AuditAction, AuditLog, Role } from '@activa-club/shared-types';

import { keys, tableName } from './dynamo';

export interface AuditActor {
  actorId: string;
  actorRole: Role;
}

export interface RecordAuditLogInput {
  action: AuditAction;
  actor: AuditActor;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
  /** Timestamp de referencia inyectable (pruebas deterministas); por defecto, ahora. */
  now?: string;
}

/** Registra una acción administrativa en `AuditLog` (ADR-0008). */
export async function recordAuditLog(
  client: DynamoDBDocumentClient,
  input: RecordAuditLogInput,
): Promise<void> {
  const timestamp = input.now ?? new Date().toISOString();
  const dateOnly = timestamp.slice(0, 10);
  const auditId = ulid();

  const auditLog: AuditLog & { PK: string; SK: string; entityType: 'AuditLog' } = {
    ...keys.auditLog(dateOnly, timestamp, auditId),
    entityType: 'AuditLog',
    auditId,
    actorId: input.actor.actorId,
    actorRole: input.actor.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? null,
    timestamp,
  };

  await client.send(new PutCommand({ TableName: tableName(), Item: auditLog }));
}
