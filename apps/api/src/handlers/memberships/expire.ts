// Proceso programado diario de vencimiento de membresías (US-038, criterio 1).
//
// Lo invoca una regla de EventBridge Scheduled (cron diario, ver
// infrastructure/terraform/modules/scheduled-job); no tiene ruta HTTP ni
// Cognito. Delega en `src/memberships/expire-memberships.ts`.
//
// Si algún socio falló, se completa el lote, se registra el resumen y recién
// entonces la invocación termina en error: así la métrica `Errors` de Lambda
// dispara la alarma (criterio 10, ADR-0008). Es seguro reintentar: el proceso
// es idempotente (criterio 6).

import type { ScheduledEvent } from 'aws-lambda';

import { logger } from '../../lib/logger';
import {
  expireMemberships,
  type ExpireMembershipsSummary,
} from '../../memberships/expire-memberships';

export async function handler(event: ScheduledEvent): Promise<ExpireMembershipsSummary> {
  const requestId = event.id;

  try {
    const summary = await expireMemberships({ requestId });
    if (summary.errors > 0) {
      throw new Error(`Vencimiento de membresías con ${summary.errors} socio(s) con error.`);
    }
    return summary;
  } catch (error) {
    logger.error('membership expiration run failed', {
      requestId,
      action: 'EXPIRE_MEMBERSHIPS',
      entityType: 'Member',
      outcome: 'FAILURE',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
