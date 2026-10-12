// Aviso a los titulares de reservas afectadas por un mantenimiento (US-045,
// RN-RES-11, RN-NOT-04, EP-05).
//
// El mantenimiento no cancela reservas: solo informa. Esta pieza emite un
// `RESOURCE_MAINTENANCE` por reserva afectada (no por socio, criterio 4) con
// la franja de esa reserva en el cuerpo. Garantías:
//   - Nunca lanza: la operación administrativa ya está confirmada y un fallo
//     de bandeja/correo no debe cambiar su respuesta (criterio 8).
//   - Idempotente: `entityId` = `<reservationId>:<hecho>`; un reintento cae
//     en `DUPLICATE` dentro de `emitNotification`.
//   - Acotada para el timeout de la Lambda (10 s): máximo `MAX_NOTIFIED`
//     avisos por petición, concurrencia `CONCURRENCY` y un presupuesto de
//     tiempo `TIME_BUDGET_MS`; lo que no cabe se registra con
//     `metric: MAINTENANCE_NOTIFY_TRUNCATED` (alarmable) en vez de
//     arriesgar un timeout tras haber escrito el bloqueo.
//
// Los titulares se resuelven con un único GetItem por socio distinto, en
// paralelo acotado; si la lectura falla se delega en `emitNotification`
// (pasa solo `memberId`), que registra la métrica estable de la bandeja.

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { emitNotification, type NotificationRecipient } from '../notifications';

/** Máximo de avisos por petición (≈ 1,5 s a 10 en paralelo; margen sobre 10 s). */
export const MAX_NOTIFIED = 100;
export const CONCURRENCY = 10;
/** Tras este tiempo no se lanzan nuevos avisos (deja margen al cierre de la Lambda). */
export const TIME_BUDGET_MS = 6000;
export const MAINTENANCE_NOTIFY_TRUNCATED = 'MAINTENANCE_NOTIFY_TRUNCATED';

export interface NotifyAffectedInput {
  client: DynamoDBDocumentClient;
  resourceName: string;
  reservations: Reservation[];
  /** Identifica el hecho (blockId o `status-maintenance`) para la idempotencia. */
  factId: string;
  requestId?: string | undefined;
  now: string;
  /** Reloj inyectable (pruebas). */
  clock?: () => number;
}

export interface NotifyAffectedResult {
  attempted: number;
  written: number;
  duplicate: number;
  failed: number;
  /** Reservas no avisadas por el límite o el presupuesto de tiempo. */
  omitted: number;
}

/** Ejecuta `worker` con concurrencia acotada; devuelve cuántos elementos arrancó. */
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
  shouldStop: () => boolean,
): Promise<number> {
  let next = 0;
  let started = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !shouldStop()) {
      const item = items[next] as T;
      next += 1;
      started += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
  return started;
}

async function lookupHolder(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<NotificationRecipient | null> {
  try {
    const result = await client.send(
      new GetCommand({
        TableName: tableName(),
        Key: keys.member(memberId),
        ProjectionExpression: 'memberId, email, firstName',
      }),
    );
    const item = result.Item as { email?: string | null; firstName?: unknown } | undefined;
    if (!item || typeof item.firstName !== 'string') return null;
    return { memberId, email: item.email ?? null, firstName: item.firstName };
  } catch {
    return null;
  }
}

export async function notifyAffectedReservations(
  input: NotifyAffectedInput,
): Promise<NotifyAffectedResult> {
  const result: NotifyAffectedResult = {
    attempted: 0,
    written: 0,
    duplicate: 0,
    failed: 0,
    omitted: 0,
  };
  const total = input.reservations.length;
  if (total === 0) return result;

  const clock = input.clock ?? Date.now;
  const startedAt = clock();
  const requestId = input.requestId ?? 'maintenance-notify';
  const overBudget = () => clock() - startedAt > TIME_BUDGET_MS;

  try {
    // Las más próximas primero: son las más urgentes si hay que truncar.
    const ordered = [...input.reservations].sort((a, b) =>
      a.startsAt === b.startsAt ? 0 : a.startsAt < b.startsAt ? -1 : 1,
    );
    const batch = ordered.slice(0, MAX_NOTIFIED);

    // 1. Titulares distintos, un GetItem cada uno.
    const holderIds = [...new Set(batch.map((r) => r.holderMemberId))];
    const holders = new Map<string, NotificationRecipient | null>();
    await mapLimit(
      holderIds,
      CONCURRENCY,
      async (memberId) => {
        holders.set(memberId, await lookupHolder(input.client, memberId));
      },
      overBudget,
    );

    // 2. Un aviso por reserva.
    result.attempted = await mapLimit(
      batch,
      CONCURRENCY,
      async (reservation) => {
        const holder = holders.get(reservation.holderMemberId) ?? null;
        const emitted = await emitNotification(
          {
            event: 'RESOURCE_MAINTENANCE',
            data: {
              resourceName: input.resourceName,
              startsAt: reservation.startsAt,
              endsAt: reservation.endsAt,
            },
            entityId: `${reservation.reservationId}:${input.factId}`,
            now: input.now,
            requestId,
            ...(holder ? { member: holder } : { memberId: reservation.holderMemberId }),
          },
          { client: input.client },
        );
        if (emitted.inbox === 'WRITTEN') result.written += 1;
        else if (emitted.inbox === 'DUPLICATE') result.duplicate += 1;
        else result.failed += 1;
      },
      overBudget,
    );
  } catch (error) {
    // Defensa en profundidad: solo errores de programación llegan aquí.
    result.failed += 1;
    logger.error('Error inesperado al avisar del mantenimiento', {
      requestId,
      entityType: 'MaintenanceNotification',
      action: 'MAINTENANCE_NOTIFY',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  result.omitted = Math.max(0, total - result.attempted);
  if (result.omitted > 0) {
    logger.warn('Avisos de mantenimiento omitidos por límite o presupuesto de tiempo', {
      requestId,
      entityType: 'MaintenanceNotification',
      action: 'MAINTENANCE_NOTIFY',
      outcome: 'FAILURE',
      metric: MAINTENANCE_NOTIFY_TRUNCATED,
      affected: total,
      omitted: result.omitted,
    });
  }
  return result;
}
