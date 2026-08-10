// Procesamiento del evento del webhook de Stripe ya autenticado por su firma
// (US-024/US-037, docs/api/contratos-api.md §5, ADR-0011 §D6). Este módulo
// **no** verifica la firma (eso ocurre antes, en el handler HTTP, sobre el
// cuerpo crudo, con `stripe.webhooks.constructEvent`) ni decide ninguna
// regla de negocio nueva: localiza el `Payment` referenciado y delega la
// transición de estado en las mismas funciones que ya usa la ruta síncrona
// de US-021 (`markPaymentFailed`/`confirmPaymentSuccess`, `./repository.ts`)
// y el mismo cálculo de vigencia (`./membership-cycle.ts`), para converger
// exactamente al mismo estado final sin importar cuál ruta llega primero
// (criterio 10).

import { ulid } from 'ulid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getDocumentClient } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { getMemberById } from '../members/repository';
import type { StripeWebhookEvent } from './webhook-event-schema';
import { resolveMembershipCycle } from './membership-cycle';
import { confirmPaymentSuccess, findPaymentById, markPaymentFailed } from './repository';

export interface ProcessStripeWebhookEventInput {
  event: StripeWebhookEvent;
  requestId: string;
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable (pruebas deterministas); por defecto, ahora. */
  now?: Date;
  /** `membershipId` del nuevo `MembershipPeriod` cuando el evento confirma un cargo; inyectable en pruebas. */
  membershipId?: string;
}

export type ProcessStripeWebhookEventOutcome =
  /** El evento confirmó un pago en `PENDING_CONFIRMATION`: activó/extendió la membresía (criterio 3). */
  | 'CONFIRMED'
  /** El evento marcó un pago en `PENDING_CONFIRMATION` como `FAILED` (criterio 6). */
  | 'FAILED_RECORDED'
  /** El pago referido ya estaba resuelto (`SUCCEEDED`/`FAILED`): sin cambios (criterios 4/5/10, convergencia). */
  | 'ALREADY_RESOLVED'
  /** El evento referencia un `paymentId` que no existe en el sistema, o no trae `metadata.paymentId` (criterios 6/7). */
  | 'PAYMENT_NOT_FOUND'
  /** `type` distinto de los dos que este backend procesa: sin efectos (criterio 9). */
  | 'IGNORED';

const RELEVANT_EVENT_TYPES = new Set(['payment_intent.succeeded', 'payment_intent.payment_failed']);

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * Catálogo propio de `failureReason` (ADR-0011 §D9, criterio 7): nunca se
 * propaga el mensaje crudo del proveedor. Mismo catálogo (por código) que
 * `./stripe-client.ts`; se duplica aquí, deliberadamente pequeño, porque
 * viene de una fuente distinta (el evento del webhook, no la excepción
 * síncrona del SDK) y no vale la pena una dependencia cruzada por una tabla
 * de una decena de entradas.
 */
const DECLINE_REASON_CATALOG: Record<string, string> = {
  card_declined: 'Tarjeta rechazada por el emisor.',
  generic_decline: 'Tarjeta rechazada por el emisor.',
  insufficient_funds: 'Fondos insuficientes.',
  expired_card: 'La tarjeta está vencida.',
  incorrect_cvc: 'El código de seguridad (CVC) es incorrecto.',
  incorrect_number: 'El número de tarjeta es incorrecto.',
  processing_error: 'Error al procesar la tarjeta. Intente nuevamente.',
  lost_card: 'Tarjeta rechazada por el emisor.',
  stolen_card: 'Tarjeta rechazada por el emisor.',
};

const DEFAULT_DECLINE_REASON = 'Pago rechazado por Stripe.';

/** Resuelve un `failureReason` propio desde `last_payment_error.decline_code`/`code` (nunca el mensaje crudo del proveedor). */
function resolveFailureReason(event: StripeWebhookEvent): string {
  const lastError = event.data.object.last_payment_error;
  const key = lastError?.decline_code ?? lastError?.code;
  if (!key) return DEFAULT_DECLINE_REASON;
  return DECLINE_REASON_CATALOG[key] ?? DEFAULT_DECLINE_REASON;
}

/**
 * Procesa un evento del webhook de Stripe ya autenticado (criterios 3-7, 9,
 * 10). Idempotente: recibir el mismo evento (o eventos fuera de orden sobre
 * el mismo pago) N veces produce el mismo estado final que recibirlo una vez
 * (criterio 2/3, caso alternativo "evento fuera de orden").
 */
export async function processStripeWebhookEvent(
  input: ProcessStripeWebhookEventInput,
): Promise<ProcessStripeWebhookEventOutcome> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { event } = input;

  if (!RELEVANT_EVENT_TYPES.has(event.type)) {
    // Criterio 9: cualquier otro `type` (p. ej. eventos disparados con
    // `stripe trigger` durante la verificación en vivo) se registra para
    // diagnóstico, sin ningún efecto.
    logger.info('stripe webhook event type is not processed by this backend (no-op)', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK',
      outcome: 'SUCCESS',
      eventType: event.type,
    });
    return 'IGNORED';
  }

  const paymentId = event.data.object.metadata?.paymentId;
  if (!paymentId) {
    // Defensivo: un evento relevante sin correlacionador. No debería ocurrir
    // (el backend siempre envía `metadata.paymentId` al crear el
    // PaymentIntent, `./stripe-client.ts`), pero si ocurriera no hay forma
    // de localizar el `Payment` — mismo tratamiento que un `paymentId`
    // desconocido (criterios 6/7).
    logger.warn('stripe webhook event is missing metadata.paymentId (no correlation possible)', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK',
      outcome: 'FAILURE',
      eventType: event.type,
    });
    return 'PAYMENT_NOT_FOUND';
  }

  const payment = await findPaymentById(client, paymentId);
  if (!payment) {
    // Criterios 6/7: sin efectos, registrado para diagnóstico, sin exponer
    // información interna al emisor (el handler responde 202 igual que un
    // evento reconocido, ver ../handlers/payments/webhook.ts).
    logger.warn('stripe webhook event references an unknown payment', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK',
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
    logger.info('stripe webhook event for an already-resolved payment (idempotent, no-op)', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK',
      outcome: 'SUCCESS',
      entityType: 'Payment',
      paymentId: payment.paymentId,
      currentStatus: payment.paymentStatus,
      eventType: event.type,
    });
    return 'ALREADY_RESOLVED';
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const member = await getMemberById(client, payment.memberId);
      if (!member) {
        // Defensivo: el Payment existe pero el socio ya no; no debería
        // ocurrir en un sistema consistente. Se registra para diagnóstico
        // sin aplicar ningún efecto (mismo tratamiento que "pago no
        // reconocible", criterio 6/7).
        logger.error('stripe webhook: payment references a member that no longer exists', {
          requestId: input.requestId,
          route: 'PAYMENTS_WEBHOOK',
          action: 'STRIPE_WEBHOOK',
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
        stripePaymentIntentId: event.data.object.id,
        confirmedAt: nowIso,
        membershipId: input.membershipId ?? ulid(),
        membershipType: payment.membershipType,
        cycleStartedAt: cycle.startedAt,
        cycleEndsAt: cycle.endsAt,
        autoRenewRequested: payment.autoRenewRequested,
      });

      logger.info('stripe webhook confirmed a payment and activated/extended the membership', {
        requestId: input.requestId,
        route: 'PAYMENTS_WEBHOOK',
        action: 'STRIPE_WEBHOOK',
        outcome: 'SUCCESS',
        entityType: 'Payment',
        paymentId: payment.paymentId,
        membershipCycleKind: cycle.kind,
      });
      return 'CONFIRMED';
    }

    // event.type === 'payment_intent.payment_failed'
    await markPaymentFailed(client, {
      memberId: payment.memberId,
      paymentId: payment.paymentId,
      createdAt: payment.createdAt,
      failureReason: resolveFailureReason(event),
    });

    logger.info('stripe webhook marked a payment as failed', {
      requestId: input.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK',
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
      logger.info('stripe webhook lost a race with a concurrent confirmation (idempotent, no-op)', {
        requestId: input.requestId,
        route: 'PAYMENTS_WEBHOOK',
        action: 'STRIPE_WEBHOOK',
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
