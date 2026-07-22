// Cursor opaco de paginación (docs/api/contratos-api.md §1: "cursor opaco",
// `{ items, nextCursor }`). Codifica/decodifica el `LastEvaluatedKey`/
// `ExclusiveStartKey` de DynamoDB como un string base64url sin significado
// para el cliente: el cliente solo debe reenviarlo tal cual, nunca
// interpretarlo. Reutilizable por cualquier listado paginado de la API
// (hoy: `GET /members`).

import { AppError } from './errors';

/** Codifica la clave de continuación de una `Query` en un cursor opaco. */
export function encodeCursor(lastEvaluatedKey: Record<string, unknown> | undefined): string | null {
  if (!lastEvaluatedKey) return null;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf-8').toString('base64url');
}

/**
 * Decodifica un cursor opaco recibido del cliente de vuelta al
 * `ExclusiveStartKey` de DynamoDB. Un cursor corrupto o manipulado se
 * traduce a `VALIDATION_ERROR` (400): nunca se expone el motivo interno.
 */
export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (cursor === undefined) return undefined;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed: unknown = JSON.parse(json);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('cursor payload is not an object');
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'El parámetro cursor no es válido.');
  }
}
