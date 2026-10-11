// Carga inicial de socios (US-009 / US-012): Lambda `migration-run` de
// INVOCACIÓN DIRECTA (consola de Lambda o `aws lambda invoke`), sin API
// Gateway, sin Cognito y sin payload (ADR-0012, que reemplaza el endpoint
// HTTP POST /admin/migration/run).
//
// Al ejecutarse lee `legacy-export.json` del bucket de migración (ADR-0005),
// ignora el evento recibido y delega en `src/migration/run.ts` la validación,
// transformación y persistencia idempotente. Devuelve el resumen del contrato
// de salida (docs/data/mapeo-migracion.md §6). Si el JSON no existe o es
// inválido, la invocación termina en error (visible en la consola / CLI).
//
// Autorización: IAM (`lambda:InvokeFunction`), no rol de aplicación. El actor
// del `AuditLog` es el operador, registrado como `system`.

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { Context } from 'aws-lambda';
import type { MigrationResult } from '@activa-club/shared-types';

import { getMigrationBucketName, optionalEnv } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { runMigration } from '../../migration/run';

/** Nombre del objeto del JSON on-premise dentro del bucket de migración (ADR-0005). */
const MIGRATION_OBJECT_KEY = 'legacy-export.json';

/** Actor registrado en el AuditLog: la invocación directa no tiene identidad Cognito. */
const MIGRATION_ACTOR = { actorId: 'migration-operator', actorRole: 'system' } as const;

let s3Client: S3Client | undefined;
function getS3Client(): S3Client {
  const region = optionalEnv('AWS_REGION');
  s3Client ??= new S3Client(region ? { region } : {});
  return s3Client;
}

async function readLegacyExportFromS3(): Promise<unknown> {
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: getMigrationBucketName(), Key: MIGRATION_OBJECT_KEY }),
  );
  const raw = await response.Body?.transformToString('utf-8');
  if (!raw) {
    throw new AppError('VALIDATION_ERROR', 'No se pudo leer el archivo de migración desde S3.');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'El archivo de migración en S3 no es JSON válido.');
  }
}

/** El evento se ignora a propósito: la migración no recibe parámetros. */
export async function handler(_event: unknown, context?: Context): Promise<MigrationResult> {
  const requestId = context?.awsRequestId ?? 'migration-run';
  const startedAt = Date.now();

  try {
    const summary = await runMigration({
      readSource: readLegacyExportFromS3,
      actor: MIGRATION_ACTOR,
    });
    logger.info('migration completed', {
      requestId,
      action: 'MIGRATION_RUN',
      entityType: 'Migration',
      actorSub: MIGRATION_ACTOR.actorId,
      role: MIGRATION_ACTOR.actorRole,
      outcome: 'SUCCESS',
      latencyMs: Date.now() - startedAt,
      total: summary.total,
      migrated: summary.migrated,
      skipped: summary.skipped,
      rejected: summary.rejected,
    });
    return summary;
  } catch (error) {
    logger.error('migration failed', {
      requestId,
      action: 'MIGRATION_RUN',
      entityType: 'Migration',
      actorSub: MIGRATION_ACTOR.actorId,
      role: MIGRATION_ACTOR.actorRole,
      outcome: 'FAILURE',
      latencyMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'UnknownError',
      ...(error instanceof AppError ? { errorCode: error.code } : {}),
    });
    throw error;
  }
}
