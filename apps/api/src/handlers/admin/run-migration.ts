// POST /admin/migration/run — dispara la migración desde el JSON en S3
// (docs/api/contratos-api.md §10, docs/data/mapeo-migracion.md §5).
//
// Handler de referencia del flujo de migración (US-009): valida rol `admin`,
// lee el JSON on-premise desde S3 y delega la transformación/persistencia
// idempotente en `src/migration/run.ts`. Responde con el contrato de salida
// documentado (mapeo-migracion.md §6). No implementa otras reglas de negocio.

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getMigrationBucketName, optionalEnv } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { runMigration } from '../../migration/run';

/** Nombre del objeto del JSON on-premise dentro del bucket de migración (ADR-0005). */
const MIGRATION_OBJECT_KEY = 'legacy-export.json';

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

async function handleRunMigration(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const result = await runMigration({
    readSource: readLegacyExportFromS3,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(202, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'MIGRATION_RUN',
  handleRunMigration,
);
