// Traducción de los resultados posibles de `POST /payments` a un estado de
// UI (US-022, criterios 7-11, docs/api/contratos-api.md §5).
//
// El backend siempre responde 201 con `paymentStatus` en `SUCCEEDED` o
// `PENDING_CONFIRMATION` (un cargo declinado se modela como el error
// `PAYMENT_FAILED`, nunca como un 201 con `paymentStatus: FAILED` — ver
// apps/api/src/payments/charge.ts). Este módulo centraliza esa traducción
// para no repetirla en CheckoutPage ni en sus pruebas.

import type { CreatePaymentResponse, ErrorDetail, PaymentStatus } from '@activa-club/shared-types';
import { ApiRequestError } from '../lib/api/http-client';

export type PaymentOutcome =
  | { status: 'SUCCEEDED'; response: CreatePaymentResponse }
  | { status: 'PENDING_CONFIRMATION'; response: CreatePaymentResponse }
  | { status: 'FAILED'; message: string }
  | { status: 'DUPLICATE'; paymentId: string | null; paymentStatus: PaymentStatus | null }
  | { status: 'MEMBER_NOT_APPROVED'; message: string }
  | { status: 'VALIDATION_ERROR'; message: string; details: ErrorDetail[] }
  | { status: 'UNAUTHENTICATED' }
  | { status: 'UNKNOWN'; message: string };

const GENERIC_ERROR_MESSAGE = 'No se pudo procesar el pago. Intenta nuevamente en unos minutos.';

/** Traduce una respuesta 201 exitosa de `POST /payments` a un resultado de UI
 * (criterios 7 y 10). */
export function toSuccessOutcome(response: CreatePaymentResponse): PaymentOutcome {
  return response.paymentStatus === 'PENDING_CONFIRMATION'
    ? { status: 'PENDING_CONFIRMATION', response }
    : { status: 'SUCCEEDED', response };
}

function findDetail(details: ErrorDetail[] | undefined, field: string): string | null {
  return details?.find((detail) => detail.field === field)?.issue ?? null;
}

/** Traduce un error de `POST /payments` a un resultado de UI (criterios
 * 8, 9, 11). No expone nunca el mensaje técnico crudo del proveedor de
 * pagos: para `PAYMENT_FAILED` siempre se usa un mensaje propio y claro. */
export function toErrorOutcome(error: unknown): PaymentOutcome {
  if (!(error instanceof ApiRequestError)) {
    return { status: 'UNKNOWN', message: GENERIC_ERROR_MESSAGE };
  }

  switch (error.code) {
    case 'PAYMENT_FAILED':
      return {
        status: 'FAILED',
        message: 'Tu tarjeta fue rechazada. Verifica los datos o intenta con otra tarjeta.',
      };
    case 'PAYMENT_DUPLICATE':
      return {
        status: 'DUPLICATE',
        paymentId: findDetail(error.details, 'paymentId'),
        paymentStatus: findDetail(error.details, 'paymentStatus') as PaymentStatus | null,
      };
    case 'MEMBER_NOT_APPROVED':
      return {
        status: 'MEMBER_NOT_APPROVED',
        message:
          error.message ||
          'Tu cuenta todavía no está aprobada para pagar. Espera la aprobación del club antes de intentar de nuevo.',
      };
    case 'VALIDATION_ERROR':
      return {
        status: 'VALIDATION_ERROR',
        message: error.message || 'Revisa los datos del pago e intenta nuevamente.',
        details: error.details ?? [],
      };
    case 'UNAUTHENTICATED':
      return { status: 'UNAUTHENTICATED' };
    default:
      return { status: 'UNKNOWN', message: error.message || GENERIC_ERROR_MESSAGE };
  }
}
