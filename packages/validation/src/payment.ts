// Esquemas de validación de pagos (RN-PAG).
// Corresponden a docs/api/contratos-api.md §5. Nunca validan ni aceptan datos de tarjeta.

import { z } from 'zod';
import { membershipTypeSchema } from './member';

/**
 * Creación de pago. Recibe únicamente el token de Culqi (tokenizado en el
 * cliente) y una clave de idempotencia; jamás PAN/CVV (RN-PAG-08).
 */
export const createPaymentSchema = z.object({
  membershipType: membershipTypeSchema,
  culqiToken: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(8).max(128),
  autoRenew: z.boolean().optional(),
});

export const paymentStatusSchema = z.enum(['PENDING_CONFIRMATION', 'SUCCEEDED', 'FAILED']);

export const listPaymentsQuerySchema = z.object({
  memberId: z.string().optional(),
  status: paymentStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
