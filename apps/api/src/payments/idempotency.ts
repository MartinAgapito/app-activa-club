// Idempotencia de pagos (`PaymentIdempotency`, docs/data/modelo-dynamodb.md
// §3.6, patrón de acceso #6; ADR-0007; US-021 criterio 2 y RT-01). Antes de
// intentar cualquier cargo se escribe este ítem con condición
// `attribute_not_exists(PK)`: si la clave ya existe, no se genera un cargo
// nuevo y el llamante (`./charge.ts`) devuelve el resultado previo.
//
// TTL: `expiresAt` (epoch segundos) se fija en `IDEMPOTENCY_TTL_SECONDS`
// (24 h) — valor placeholder del MVP, documentado aquí para que Arquitectura
// lo confirme o ajuste; debe "superar ampliamente la ventana de reintento
// razonable" (US-021, caso alternativo "ítem de idempotencia vencido por
// TTL"). El TTL de la tabla en sí (atributo `expiresAt` activo) es
// responsabilidad de Terraform (US-019, criterio 7).

import {
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { PaymentStatus } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

/** Ventana de idempotencia del MVP: 24 horas (placeholder, ver nota de cabecera). */
export const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

const UNIQUENESS_CONDITION = 'attribute_not_exists(PK)';

export interface PaymentIdempotencyRecord {
  paymentId: string;
  paymentStatus: PaymentStatus;
}

export type ReserveIdempotencyKeyOutcome =
  { outcome: 'RESERVED' } | ({ outcome: 'DUPLICATE' } & PaymentIdempotencyRecord);

export interface ReserveIdempotencyKeyInput {
  idempotencyKey: string;
  /** `paymentId` que identificará este intento si la reserva prospera. */
  paymentId: string;
  /** Marca de tiempo ISO de referencia (inyectable en pruebas). */
  now: string;
}

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

function toEpochSeconds(iso: string, ttlSeconds: number): number {
  return Math.floor(Date.parse(iso) / 1000) + ttlSeconds;
}

/** Lee el ítem de idempotencia existente para una clave (usado tras un `ConditionalCheckFailedException`). */
async function getIdempotencyRecord(
  client: DynamoDBDocumentClient,
  idempotencyKey: string,
): Promise<PaymentIdempotencyRecord | undefined> {
  const key = keys.paymentIdempotency(idempotencyKey);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': key.PK, ':sk': key.SK },
      Limit: 1,
    }),
  );
  const item = result.Items?.[0] as { paymentId: string; paymentStatus: PaymentStatus } | undefined;
  return item ? { paymentId: item.paymentId, paymentStatus: item.paymentStatus } : undefined;
}

/**
 * Reserva `idempotencyKey` con un `PutItem` condicionado a
 * `attribute_not_exists(PK)` (criterio 2). Si la condición falla, la clave ya
 * existe: se lee el registro previo y se devuelve `DUPLICATE` con su
 * `paymentId`/`paymentStatus`, sin generar ningún cargo nuevo.
 */
export async function reserveIdempotencyKey(
  client: DynamoDBDocumentClient,
  input: ReserveIdempotencyKeyInput,
): Promise<ReserveIdempotencyKeyOutcome> {
  const key = keys.paymentIdempotency(input.idempotencyKey);
  try {
    await client.send(
      new PutCommand({
        TableName: tableName(),
        Item: {
          ...key,
          entityType: 'PaymentIdempotency',
          paymentId: input.paymentId,
          paymentStatus: 'PENDING_CONFIRMATION' satisfies PaymentStatus,
          expiresAt: toEpochSeconds(input.now, IDEMPOTENCY_TTL_SECONDS),
        },
        ConditionExpression: UNIQUENESS_CONDITION,
      }),
    );
    return { outcome: 'RESERVED' };
  } catch (error) {
    if (!isConditionalCheckFailure(error)) throw error;

    const existing = await getIdempotencyRecord(client, input.idempotencyKey);
    // Defensivo: la condición falló, así que el ítem debería existir; si por
    // una carrera extrema ya no está (p. ej. TTL justo vencido), se trata como
    // un intento nuevo en vez de bloquear al socio sin motivo.
    if (!existing) return { outcome: 'RESERVED' };
    return { outcome: 'DUPLICATE', ...existing };
  }
}

/**
 * Actualiza el `paymentStatus` final del ítem de idempotencia una vez resuelto
 * el cargo (éxito, fallo o ambiguo), para que una consulta posterior de la
 * misma clave refleje el resultado real sin depender de una lectura adicional
 * del `Payment`.
 */
export async function finalizeIdempotencyRecord(
  client: DynamoDBDocumentClient,
  idempotencyKey: string,
  paymentStatus: PaymentStatus,
): Promise<void> {
  const key = keys.paymentIdempotency(idempotencyKey);
  await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: key,
      ConditionExpression: 'attribute_exists(PK)',
      UpdateExpression: 'SET paymentStatus = :status',
      ExpressionAttributeValues: { ':status': paymentStatus },
    }),
  );
}
