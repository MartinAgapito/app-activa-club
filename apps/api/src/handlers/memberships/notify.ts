// Proceso programado diario de avisos de renovación (US-047).
//
// Lo invoca una regla de EventBridge Scheduled a las 08:00 hora de Lima (ver
// infrastructure/terraform/environments/dev/main.tf, module
// "job_memberships_notify"); sin ruta HTTP ni Cognito. Corre DESPUÉS del
// proceso de vencimiento (US-038, 00:15) y lee el rastro que este deja.
//
// Si algún rastro falló, se completa el lote, se registra el resumen y recién
// entonces la invocación termina en error para que la alarma dispare
// (ADR-0008). Es seguro reintentar: la bandeja es idempotente.

import type { ScheduledEvent } from 'aws-lambda';

import { logger } from '../../lib/logger';
import { notifyRenewals, type NotifyRenewalsSummary } from '../../memberships/notify-renewals';

export async function handler(event: ScheduledEvent): Promise<NotifyRenewalsSummary> {
  const requestId = event.id;

  try {
    const summary = await notifyRenewals({ requestId });
    if (summary.errors > 0) {
      throw new Error(`Avisos de renovación con ${summary.errors} rastro(s) con error.`);
    }
    return summary;
  } catch (error) {
    logger.error('renewal notification run failed', {
      requestId,
      action: 'NOTIFY_RENEWALS',
      entityType: 'MembershipTransition',
      outcome: 'FAILURE',
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
