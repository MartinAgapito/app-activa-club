// Proceso programado diario de recordatorio de reservas (US-046, criterio 1).
//
// Lo invoca una regla de EventBridge Scheduled (18:00 America/Lima; ver
// infrastructure/terraform/modules/scheduled-job); no tiene ruta HTTP ni
// Cognito. Delega en `src/reservations/remind-reservations.ts`.
//
// Si algún recurso o reserva falló, se completa el lote, se registra el
// resumen y recién entonces la invocación termina en error: así la métrica
// `Errors` de Lambda dispara la alarma (criterio 7, ADR-0008) y el reintento
// asíncrono de Lambda reprocesa de forma segura, porque el proceso es
// idempotente (criterio 4).

import type { ScheduledEvent } from 'aws-lambda';

import { logger } from '../../lib/logger';
import {
  remindReservations,
  type RemindReservationsSummary,
} from '../../reservations/remind-reservations';

export async function handler(event: ScheduledEvent): Promise<RemindReservationsSummary> {
  const requestId = event.id;

  try {
    const summary = await remindReservations({ requestId });
    if (summary.errors > 0) {
      throw new Error(`Recordatorio de reservas con ${summary.errors} error(es).`);
    }
    return summary;
  } catch (error) {
    logger.error('reservation reminder run failed', {
      requestId,
      action: 'REMIND_RESERVATIONS',
      entityType: 'Reservation',
      outcome: 'FAILURE',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
