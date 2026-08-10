// Cliente de `POST /payments` — US-022, migrado a Stripe por US-037
// (docs/api/contratos-api.md §5, ADR-0011).
//
// El backend crea el cargo server-side con la llave secreta de Stripe
// (nunca en el cliente). El cuerpo enviado solo incluye `membershipType`,
// `stripePaymentMethodId` (creado por Stripe.js/Elements, ver ./stripe.ts)
// e `idempotencyKey` — nunca datos de tarjeta (RN-PAG-08). Reutiliza `apiRequest`
// (lib/api/http-client.ts), que ya normaliza los errores al formato
// estándar del contrato (`ApiRequestError` con `code`/`details`, incluidos
// `PAYMENT_FAILED`/`PAYMENT_DUPLICATE`/`MEMBER_NOT_APPROVED`/
// `VALIDATION_ERROR`).

import type { CreatePaymentRequest, CreatePaymentResponse } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Cobra la membresía del socio autenticado (RN-PAG-01/04/07, ADR-0011). */
export function createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  return apiRequest<CreatePaymentResponse>('/payments', {
    method: 'POST',
    body: request,
  });
}
