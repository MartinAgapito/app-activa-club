// Orquestador del flujo de migración on-premise → DynamoDB
// (docs/data/mapeo-migracion.md). Lee el JSON de origen (inyectable: S3 en
// producción, un fixture en pruebas), valida la envoltura, transforma y
// persiste cada socio de forma idempotente y tolerante a registros inválidos
// (RN-MIG-01..06), y deja un `AuditLog` con el resumen (ADR-0008).

import { PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { z } from 'zod';
import type {
  AuditLog,
  LegacyMember,
  MigrationRejectedItem,
  MigrationResult,
  Role,
} from '@activa-club/shared-types';
import { legacyExportEnvelopeSchema, legacyMemberSchema } from '@activa-club/validation';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { limaDateOnly, transformLegacyMember } from './transform';
import { writeMigratedMember } from './repository';

export interface MigrationActor {
  actorId: string;
  actorRole: Role;
}

export interface RunMigrationInput {
  /** Lee el JSON crudo desde su origen (S3 en producción; inyectable en pruebas). */
  readSource: () => Promise<unknown>;
  /** Quién dispara la migración, para la auditoría (admin autenticado o `SYSTEM`). */
  actor: MigrationActor;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (`lib/dynamo`). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

/**
 * Normaliza la salida de `legacyMemberSchema.safeParse` al tipo `LegacyMember`
 * de `packages/shared-types`. Necesario porque Zod tipa los campos
 * `.optional()` como `T | undefined`, mientras el DTO declara `telefono?: string`
 * (sin `undefined` explícito); con `exactOptionalPropertyTypes` solo se puede
 * asignar omitiendo la clave cuando no hay valor.
 */
function toLegacyMember(data: z.infer<typeof legacyMemberSchema>): LegacyMember {
  return {
    legacyId: data.legacyId,
    dni: data.dni,
    nombres: data.nombres,
    apellidos: data.apellidos,
    email: data.email,
    membresia: data.membresia,
    saldoPendiente: data.saldoPendiente,
    ...(data.telefono !== undefined ? { telefono: data.telefono } : {}),
  };
}

/** Deriva un motivo de rechazo legible a partir del primer error de Zod (mapeo-migracion.md §4/§6). */
function rejectionReasonFor(socio: unknown, index: number): MigrationRejectedItem {
  const result = legacyMemberSchema.safeParse(socio);
  if (result.success) {
    return { index, reason: 'UNKNOWN_VALIDATION_ERROR' };
  }
  const firstIssue = result.error.issues[0];
  const field = firstIssue?.path[0];
  if (firstIssue?.code === 'invalid_type' && typeof field === 'string') {
    return { index, reason: `MISSING_${field.toUpperCase()}` };
  }
  return {
    index,
    reason: firstIssue ? `${String(field ?? 'record')}: ${firstIssue.message}` : 'INVALID_RECORD',
  };
}

async function recordMigrationAudit(
  client: DynamoDBDocumentClient,
  actor: MigrationActor,
  summary: MigrationResult,
): Promise<void> {
  const auditId = ulid();
  const timestamp = summary.runAt;
  const dateOnly = timestamp.slice(0, 10);
  const auditLog: AuditLog & { PK: string; SK: string; entityType: 'AuditLog' } = {
    ...keys.auditLog(dateOnly, timestamp, auditId),
    entityType: 'AuditLog',
    auditId,
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action: 'MIGRATION_RUN',
    targetType: 'Migration',
    targetId: auditId,
    metadata: {
      total: summary.total,
      migrated: summary.migrated,
      skipped: summary.skipped,
      rejected: summary.rejected,
    },
    timestamp,
  };
  await client.send(new PutCommand({ TableName: tableName(), Item: auditLog }));
}

/**
 * Ejecuta la migración: lee el origen, valida, transforma y persiste cada
 * socio, y registra el resumen como auditoría. Devuelve el contrato de salida
 * de docs/data/mapeo-migracion.md §6.
 */
export async function runMigration(input: RunMigrationInput): Promise<MigrationResult> {
  const now = input.now ?? new Date();
  const runAt = now.toISOString();
  const todayLima = limaDateOnly(now);
  const client = input.client ?? getDocumentClient();

  const raw = await input.readSource();
  const envelope = legacyExportEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'El archivo de migración no tiene el formato esperado (version/exportedAt/socios).',
    );
  }

  const socios = envelope.data.socios;
  let migrated = 0;
  let skipped = 0;
  const rejectedItems: MigrationRejectedItem[] = [];

  for (let index = 0; index < socios.length; index += 1) {
    const rawSocio = socios[index];
    const parsedSocio = legacyMemberSchema.safeParse(rawSocio);
    if (!parsedSocio.success) {
      rejectedItems.push(rejectionReasonFor(rawSocio, index));
      continue;
    }

    const legacy = toLegacyMember(parsedSocio.data);
    try {
      const items = transformLegacyMember(legacy, { todayLima });
      const outcome = await writeMigratedMember(client, items);
      if (outcome === 'MIGRATED') {
        migrated += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      logger.error('migration item write failed', {
        requestId: 'migration',
        route: 'MIGRATION_RUN',
        action: 'MIGRATION_RUN',
        outcome: 'FAILURE',
        legacyId: legacy.legacyId,
      });
      rejectedItems.push({
        index,
        reason: error instanceof Error ? error.name : 'WRITE_ERROR',
      });
    }
  }

  const summary: MigrationResult = {
    total: socios.length,
    migrated,
    skipped,
    rejected: rejectedItems.length,
    rejectedItems,
    runAt,
  };

  await recordMigrationAudit(client, input.actor, summary);

  return summary;
}
