// Cliente de `POST /payments` — US-022 (docs/api/contratos-api.md §5).
//
// El backend crea el cargo server-side con la llave privada de Culqi
// (nunca en el cliente). El cuerpo enviado solo incluye `membershipType`,
// `culqiToken` (tokenizado por Culqi.js, ver ./culqi.ts) e `idempotencyKey`
// — nunca datos de tarjeta (RN-PAG-08). Reutiliza `apiRequest`
// (lib/api/http-client.ts), que ya normaliza los errores al formato
// estándar del contrato (`ApiRequestError` con `code`/`details`, incluidos
// `PAYMENT_FAILED`/`PAYMENT_DUPLICATE`/`MEMBER_NOT_APPROVED`/
// `VALIDATION_ERROR`).

import type { CreatePaymentRequest, CreatePaymentResponse } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Cobra la membresía del socio autenticado (RN-PAG-01/04/07, ADR-0007). */
export function createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
  return apiRequest<CreatePaymentResponse>('/payments', {
    method: 'POST',
    body: request,
  });
}
