// Esquemas de validación de pagos (RN-PAG).
// Corresponden a docs/api/contratos-api.md §5. Nunca validan ni aceptan datos de tarjeta.

import { z } from 'zod';
import { membershipTypeSchema } from './member';

/**
 * Creación de pago. Recibe únicamente el identificador de método de pago de
 * Stripe (`pm_...`, tokenizado en el cliente por Stripe.js/Elements) y una
 * clave de idempotencia; jamás PAN/CVV (RN-PAG-08, ADR-0011 §D1).
 *
 * `.strict()` (US-026 criterio 1): por defecto Zod descarta en silencio
 * cualquier clave no declarada en vez de rechazar la solicitud; en este
 * esquema en particular eso no es aceptable — si un cliente (malicioso o
 * con un bug) llegara a enviar `cardNumber`/`cvv`/`expirationDate`, la
 * solicitud debe fallar explícitamente con `VALIDATION_ERROR` en vez de que
 * el campo se elimine sin dejar rastro. El resto de los esquemas de
 * `packages/validation` no necesita este endurecimiento (no reciben datos
 * de tarjeta ni secretos); se acota a este esquema para no cambiar el
 * comportamiento de otros endpoints sin evaluarlo caso por caso.
 */
export const createPaymentSchema = z
  .object({
    membershipType: membershipTypeSchema,
    stripePaymentMethodId: z.string().trim().min(1),
    idempotencyKey: z.string().trim().min(8).max(128),
    autoRenew: z.boolean().optional(),
  })
  .strict();

export const paymentStatusSchema = z.enum(['PENDING_CONFIRMATION', 'SUCCEEDED', 'FAILED']);

export const listPaymentsQuerySchema = z.object({
  memberId: z.string().optional(),
  status: paymentStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
