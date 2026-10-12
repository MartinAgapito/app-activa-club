// Avisos del resultado de un pago al socio titular (US-043, EP-05,
// RN-NOT-04). Capa fina sobre `emitNotification` (US-040) que usan los dos
// caminos que resuelven un pago: el cobro síncrono (`./charge.ts`) y el
// webhook (`./webhook.ts`).
//
// Garantías:
//   - Se invoca solo tras ganar la transición a un estado final; la
//     idempotencia por `paymentId` del emisor es la segunda red de seguridad
//     (un mismo pago nunca produce dos avisos del mismo evento).
//   - Nunca lanza: un fallo de notificación no cambia la respuesta HTTP ni el
//     estado del pago (US-043 criterio 7). El webhook jamás responde error a
//     Stripe por esto, para no provocar reintentos del proveedor.
//   - Solo viajan plan, monto, vigencia o motivo del catálogo propio; nunca
//     datos de tarjeta ni identificadores de Stripe (RN-PAG-08).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MembershipType } from '@activa-club/shared-types';

import { logger } from '../lib/logger';
import { emitNotification, type NotificationRecipient } from '../notifications';

export type PaymentNotice =
  | {
      event: 'PAYMENT_SUCCEEDED';
      paymentId: string;
      data: { membershipType: MembershipType; amount: number; membershipEndsAt: string };
    }
  | { event: 'PAYMENT_FAILED'; paymentId: string; data: { reason: string } };

export interface PaymentNotifyTarget {
  memberId: string;
  /** Si ya se tiene, evita una lectura extra del socio en el emisor. */
  recipient?: NotificationRecipient;
}

export interface PaymentNotifyContext {
  client: DynamoDBDocumentClient;
  requestId: string;
}

/** Contrato inyectable (pruebas); por defecto, `defaultPaymentNotifier`. */
export type PaymentNotifier = (
  target: PaymentNotifyTarget,
  notice: PaymentNotice,
  context: PaymentNotifyContext,
) => Promise<void>;

export const defaultPaymentNotifier: PaymentNotifier = async (target, notice, context) => {
  const base = {
    entityId: notice.paymentId,
    requestId: context.requestId,
    ...(target.recipient ? { member: target.recipient } : { memberId: target.memberId }),
  };
  const deps = { client: context.client };
  if (notice.event === 'PAYMENT_SUCCEEDED') {
    await emitNotification({ ...base, event: notice.event, data: notice.data }, deps);
  } else {
    await emitNotification({ ...base, event: notice.event, data: notice.data }, deps);
  }
};

/** Emite el aviso sin propagar jamás un error al llamante. */
export async function notifyPaymentResult(
  notifier: PaymentNotifier | undefined,
  target: PaymentNotifyTarget,
  notice: PaymentNotice,
  context: PaymentNotifyContext,
): Promise<void> {
  try {
    await (notifier ?? defaultPaymentNotifier)(target, notice, context);
  } catch (error) {
    logger.warn('payment notification could not be emitted (no effect on the payment)', {
      requestId: context.requestId,
      route: 'PAYMENT_NOTIFICATION',
      action: 'NOTIFY_PAYMENT_RESULT',
      outcome: 'FAILURE',
      event: notice.event,
      memberId: target.memberId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
