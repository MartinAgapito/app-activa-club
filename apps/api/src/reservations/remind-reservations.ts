// Orquestador del recordatorio diario de reservas (US-046, RN-NOT-04).
//
// Cada día a las 18:00 America/Lima (23:00 UTC) avisa al TITULAR de cada
// reserva `CONFIRMED`/`APPROVED` cuyo inicio cae en el día calendario SIGUIENTE
// en hora de Lima. Reglas (US-046 / EP-05):
//   - Solo al titular, nunca a participantes ni invitados (criterio 2 y EP-05).
//   - El texto no lleva nombres ni DNI de participantes: solo
//     `participantCount` (plantilla `RESERVATION_REMINDER`).
//   - Idempotente (criterio 4): `entityId = reservationId`, que junto con el
//     evento y el socio forma la clave de deduplicación del motor; una segunda
//     ejecución del día devuelve `DUPLICATE` sin escribir ni enviar correo.
//   - Un recurso en `MAINTENANCE` igual recibe: la reserva sigue vigente.
//   - Un error en un recurso o en una reserva no detiene el lote (criterio 6).
//
// Cómo encuentra candidatos: recorre los diez `resourceId` fijos del catálogo
// (GetItem de cada uno para el nombre; sin Scan) y consulta GSI3 por recurso y
// rango [00:00 de mañana, 00:00 de pasado mañana) de Lima expresado en UTC
// (patrón de acceso 21). Un día de Lima cruza el día UTC (UTC-5), por eso el
// rango se calcula con `limaWallTimeToUtc` y no por prefijo de fecha.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { addDaysToDateOnly } from '../memberships/vigency';
import { emitNotification, type EmitNotificationDeps } from '../notifications';
import { CATALOG_RESOURCE_IDS } from '../resources/catalog';
import { getResourceById } from '../resources/repository';
import {
  getReminderRecipient,
  listRemindableReservations,
  type ReminderRecipient,
} from './remind-repository';
import { limaCalendarDate, limaWallTimeToUtc } from './time';

/** Titulares resueltos en paralelo (cada uno es un GetItem + una escritura). */
export const REMINDER_CONCURRENCY = 10;

export interface RemindReservationsInput {
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido. */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable (pruebas deterministas). */
  now?: Date;
  /** Identificador de la invocación para el log (id del evento programado). */
  requestId?: string;
  /** Dependencias del motor de notificaciones (pruebas). */
  emitDeps?: EmitNotificationDeps;
}

/** Resumen de una ejecución (criterio 7). */
export interface RemindReservationsSummary {
  /** Día calendario de Lima cuyas reservas se recuerdan (`YYYY-MM-DD`). */
  targetDateLima: string;
  /** Recursos del catálogo recorridos. */
  resources: number;
  /** Reservas `CONFIRMED`/`APPROVED` del día evaluadas. */
  evaluated: number;
  /** Recordatorios nuevos escritos en la bandeja. */
  sent: number;
  /** Reservas que ya tenían su recordatorio (reintento o doble ejecución). */
  duplicated: number;
  /** Recursos o reservas cuya evaluación falló; el resto del lote continuó. */
  errors: number;
}

/** Ejecuta `worker` sobre cada elemento con concurrencia acotada. */
async function mapLimit<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next] as T;
      next += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

export async function remindReservations(
  input: RemindReservationsInput = {},
): Promise<RemindReservationsSummary> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const requestId = input.requestId ?? 'remind-reservations';
  const startedAt = Date.now();

  const targetDateLima = addDaysToDateOnly(limaCalendarDate(now), 1);
  const window = {
    from: limaWallTimeToUtc(targetDateLima, '00:00').toISOString(),
    to: limaWallTimeToUtc(addDaysToDateOnly(targetDateLima, 1), '00:00').toISOString(),
  };

  const summary: RemindReservationsSummary = {
    targetDateLima,
    resources: CATALOG_RESOURCE_IDS.length,
    evaluated: 0,
    sent: 0,
    duplicated: 0,
    errors: 0,
  };

  const logFailure = (message: string, error: unknown, extra: Record<string, unknown>): void => {
    summary.errors += 1;
    logger.error(message, {
      requestId,
      action: 'REMIND_RESERVATIONS',
      entityType: 'Reservation',
      outcome: 'FAILURE',
      errorName: errorName(error),
      ...extra,
    });
  };

  const holders = new Map<string, Promise<ReminderRecipient | null>>();
  const resolveHolder = (memberId: string): Promise<ReminderRecipient | null> => {
    let pending = holders.get(memberId);
    if (!pending) {
      pending = getReminderRecipient(client, memberId);
      holders.set(memberId, pending);
    }
    return pending;
  };

  const remindOne = async (resourceName: string, reservation: Reservation): Promise<void> => {
    try {
      const holder = await resolveHolder(reservation.holderMemberId);
      if (!holder) {
        logFailure('reservation holder not found', new Error('HolderNotFound'), {
          reservationId: reservation.reservationId,
          memberId: reservation.holderMemberId,
        });
        return;
      }
      const result = await emitNotification(
        {
          event: 'RESERVATION_REMINDER',
          data: {
            resourceName,
            startsAt: reservation.startsAt,
            endsAt: reservation.endsAt,
            participantCount: reservation.participantCount,
          },
          entityId: reservation.reservationId,
          member: holder,
          now: nowIso,
          requestId,
        },
        { client, ...input.emitDeps },
      );
      if (result.inbox === 'WRITTEN') summary.sent += 1;
      else if (result.inbox === 'DUPLICATE') summary.duplicated += 1;
      else {
        logFailure('reservation reminder inbox write failed', new Error('InboxWriteFailed'), {
          reservationId: reservation.reservationId,
          memberId: reservation.holderMemberId,
        });
      }
    } catch (error) {
      logFailure('reservation reminder failed', error, {
        reservationId: reservation.reservationId,
        memberId: reservation.holderMemberId,
      });
    }
  };

  for (const resourceId of CATALOG_RESOURCE_IDS) {
    try {
      const resource = await getResourceById(client, resourceId);
      if (!resource) {
        // Catálogo sin cargar para este id: no hay nada que recordar.
        logger.warn('catalog resource not found', {
          requestId,
          action: 'REMIND_RESERVATIONS',
          entityType: 'Resource',
          skipped: true,
          resourceId,
        });
        continue;
      }

      const reservations = await listRemindableReservations(client, resourceId, window);
      // Defensa en profundidad: el filtro de estado ya viaja en la consulta.
      const remindable = reservations.filter(
        (r) => r.reservationStatus === 'CONFIRMED' || r.reservationStatus === 'APPROVED',
      );
      summary.evaluated += remindable.length;

      await mapLimit(remindable, REMINDER_CONCURRENCY, (reservation) =>
        remindOne(typeof resource.name === 'string' ? resource.name : resourceId, reservation),
      );
    } catch (error) {
      logFailure('resource reminder evaluation failed', error, { resourceId });
    }
  }

  logger.info('reservation reminder run completed', {
    requestId,
    action: 'REMIND_RESERVATIONS',
    entityType: 'Reservation',
    outcome: summary.errors === 0 ? 'SUCCESS' : 'FAILURE',
    latencyMs: Date.now() - startedAt,
    ...summary,
  });

  return summary;
}
