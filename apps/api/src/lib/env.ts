// Acceso tipado a variables de entorno de cada Lambda.
//
// Centraliza los nombres usados por los handlers (ver `.env.example` en la raíz
// del monorepo) y evita el acceso directo `process.env.FOO`, incompatible con
// `noPropertyAccessFromIndexSignature` (tsconfig.base.json).

/** Lee una variable de entorno obligatoria; falla rápido si falta (config error). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

/** Lee una variable de entorno opcional. */
export function optionalEnv(name: string): string | undefined {
  return process.env[name];
}

/** Nombre físico de la tabla DynamoDB single-table (docs/data/modelo-dynamodb.md). */
export function getTableName(): string {
  return requireEnv('DYNAMODB_TABLE_NAME');
}

/** Bucket S3 de migración (docs/data/mapeo-migracion.md §5, ADR-0005). */
export function getMigrationBucketName(): string {
  return requireEnv('MIGRATION_BUCKET_NAME');
}
