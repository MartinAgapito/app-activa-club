// Procesamiento del evento del webhook de Culqi ya autenticado por su firma
// (US-024, docs/api/contratos-api.md §5, ADR-0007). Este módulo **no**
// verifica la firma (eso ocurre antes, en el handler HTTP, sobre el cuerpo
// crudo — `./webhook-signature.ts`) ni decide ninguna regla de negocio nueva:
// localiza el `Payment` referenciado y delega la transición de estado en las
// mismas funciones que ya usa la ruta síncrona de US-021
// (`markPaymentFailed`/`confirmPaymentSuccess`, `./repository.ts`) y el mismo
// cálculo de vigencia (`./membership-cycle.ts`), para converger exactamente
// al mismo estado final sin importar cuál ruta llega primero (criterio 10).

import { ulid } from 'ulid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getDocumentClient } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { getMemberById } from '../members/repository';
import type { CulqiWebhookEvent } from './webhook-event-schema';
import { resolveMembershipCycle } from './membership-cycle';
import { confirmPaymentSuccess, findPaymentById, markPaymentFailed } from './repository';

export interface ProcessCulqiWebhookEventInput {
  event: CulqiWebhookEvent;
  requestId: string;
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable (pruebas deterministas); por defecto, ahora. */
  now?: Date;
  /** `membershipId` del nuevo `MembershipPeriod` cuando el evento confirma un cargo; inyectable en pruebas. */
  membershipId?: string;
}

export type ProcessCulqiWebhookEventOutcome =
  /** El evento confirmó un pago en `PENDING_CONFIRMATION`: activó/extendió la membresía (criterio 3). */
  | 'CONFIRMED'
  /** El evento marcó un pago en `PENDING_CONFIRMATION` como `FAILED` (criterio 6). */
  | 'FAILED_RECORDED'
  /** El pago referido ya estaba resuelto (`SUCCEEDED`/`FAILED`): sin cambios (criterios 4/5/10, convergencia). */
  | 'ALREADY_RESOLVED'
  /** El evento referencia un `paymentId` que no existe en el sistema (criterios 6/7). */
  | 'PAYMENT_NOT_FOUND';

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/** Nunca se confía en el `culqiChargeId` recibido si viniera vacío (defensivo; el esquema ya lo exige, pero esta función no depende únicamente de esa validación). */
function resolveFailureReason(event: CulqiWebhookEvent): string {
  return event.data.object.outcome?.user_message ?? 'Cargo rechazado por Culqi.';
}

/**
 * Procesa un evento del webhook de Culqi ya autenticado (criterios 3-7, 10).
 * Idempotente: recibir el mismo evento (o eventos fuera de orden sobre el
 * mismo pago) N veces produce el mismo estado final que recibirlo una vez
 * (criterio 2/3, caso alternativo "evento fuera de orden").
 */
export async function processCulqiWebhookEvent(
  input: ProcessCulqiWebhookEventInput,
): Promise<ProcessCulqiWebhookEventOutcome> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { event } = input;
  const paymentId = event.data.object.metadata.reference;

  const payment = await findPaymentById(client, paymentId);
  if (!payment) {
    // Criterios 6/7: sin efectos, registrado para diagnóstico, sin exponer
    // información interna al emisor (el handler responde 202 igual que un
    // evento reconocido, ver ./webhook-signature.ts y el handler HTTP).
    logger.warn('culqi webhook event references an unknown payment', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'CULQI_WEBHOOK',
      outcome: 'FAILURE',
      entityType: 'Payment',
      referencedPaymentId: paymentId,
      eventType: event.type,
    });
    return 'PAYMENT_NOT_FOUND';
  }

  if (payment.paymentStatus !== 'PENDING_CONFIRMATION') {
    // Convergencia con la ruta síncrona (criterios 4/5/10) y evento fuera de
    // orden (caso alternativo "fallido después de exitoso"): el estado ya
    // confirmado prevalece siempre, sin importar lo que diga este evento.
    logger.info('culqi webhook event for an already-resolved payment (idempotent, no-op)', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'CULQI_WEBHOOK',
      outcome: 'SUCCESS',
      entityType: 'Payment',
      paymentId: payment.paymentId,
      currentStatus: payment.paymentStatus,
      eventType: event.type,
    });
    return 'ALREADY_RESOLVED';
  }

  try {
    if (event.type === 'charge.succeeded') {
      const member = await getMemberById(client, payment.memberId);
      if (!member) {
        // Defensivo: el Payment existe pero el socio ya no; no debería
        // ocurrir en un sistema consistente. Se registra para diagnóstico
        // sin aplicar ningún efecto (mismo tratamiento que "pago no
        // reconocible", criterio 6/7).
        logger.error('culqi webhook: payment references a member that no longer exists', {
          requestId: input.requestId,
          route: 'PAYMENTS_WEBHOOK',
          action: 'CULQI_WEBHOOK',
          outcome: 'FAILURE',
          entityType: 'Payment',
          paymentId: payment.paymentId,
          memberId: payment.memberId,
        });
        return 'PAYMENT_NOT_FOUND';
      }

      const cycle = resolveMembershipCycle({
        membershipType: payment.membershipType,
        paymentConfirmedAt: nowIso,
        currentMembershipStatus: member.membershipStatus,
        currentMembershipEndsAt: member.membershipEndsAt,
      });

      await confirmPaymentSuccess(client, {
        memberId: payment.memberId,
        paymentId: payment.paymentId,
        createdAt: payment.createdAt,
        culqiChargeId: event.data.object.id,
        confirmedAt: nowIso,
        membershipId: input.membershipId ?? ulid(),
        membershipType: payment.membershipType,
        cycleStartedAt: cycle.startedAt,
        cycleEndsAt: cycle.endsAt,
        autoRenewRequested: payment.autoRenewRequested,
      });

      logger.info('culqi webhook confirmed a payment and activated/extended the membership', {
        requestId: input.requestId,
        route: 'PAYMENTS_WEBHOOK',
        action: 'CULQI_WEBHOOK',
        outcome: 'SUCCESS',
        entityType: 'Payment',
        paymentId: payment.paymentId,
        membershipCycleKind: cycle.kind,
      });
      return 'CONFIRMED';
    }

    // event.type === 'charge.failed'
    await markPaymentFailed(client, {
      memberId: payment.memberId,
      paymentId: payment.paymentId,
      createdAt: payment.createdAt,
      failureReason: resolveFailureReason(event),
    });

    logger.info('culqi webhook marked a payment as failed', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'CULQI_WEBHOOK',
      outcome: 'SUCCESS',
      entityType: 'Payment',
      paymentId: payment.paymentId,
    });
    return 'FAILED_RECORDED';
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      // Carrera con la ruta síncrona (US-021) u otra entrega del mismo
      // webhook: el pago dejó de estar `PENDING_CONFIRMATION` entre la
      // lectura y la escritura. No es un error real: es la misma
      // convergencia idempotente de los criterios 4/5/10.
      logger.info('culqi webhook lost a race with a concurrent confirmation (idempotent, no-op)', {
        requestId: input.requestId,
        route: 'PAYMENTS_WEBHOOK',
        action: 'CULQI_WEBHOOK',
        outcome: 'SUCCESS',
        entityType: 'Payment',
        paymentId: payment.paymentId,
        eventType: event.type,
      });
      return 'ALREADY_RESOLVED';
    }
    throw error;
  }
}
