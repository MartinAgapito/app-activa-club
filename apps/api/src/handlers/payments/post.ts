// POST /payments — cobra la membresía del socio autenticado de forma
// idempotente y confirmada (docs/api/contratos-api.md §5,
// docs/scrum/historias/US-021-cobro-membresia-idempotente-culqi.md, ADR-0007).
// Solo `member` (el titular del pago es siempre el socio autenticado, nunca
// un `memberId` de la solicitud).
//
// Nota de alcance: este handler todavía no está cableado en Terraform
// (`modules/endpoint`, US-019 en curso en paralelo) ni tiene un cliente real
// de Culqi (usa el stub de `../../payments/culqi-client.ts` por defecto,
// documentado ahí). Queda listo para que ambas piezas se conecten sin tocar
// esta capa.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import type { CreatePaymentRequest } from '@activa-club/shared-types';
import { createPaymentSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { createPayment } from '../../payments/charge';

/**
 * Adapta la salida de `createPaymentSchema.safeParse` a `CreatePaymentRequest`.
 * Necesario porque Zod tipa `autoRenew` (`.optional()`) como
 * `boolean | undefined`, mientras el DTO declara `autoRenew?: boolean`; con
 * `exactOptionalPropertyTypes` solo se puede asignar omitiendo la clave
 * cuando no hay valor (mismo ajuste que `toRegistrationRequest`,
 * `../registration/post.ts`).
 */
function toCreatePaymentRequest(
  data: ReturnType<typeof createPaymentSchema.parse>,
): CreatePaymentRequest {
  return {
    membershipType: data.membershipType,
    culqiToken: data.culqiToken,
    idempotencyKey: data.idempotencyKey,
    ...(data.autoRenew !== undefined ? { autoRenew: data.autoRenew } : {}),
  };
}

async function handleCreatePayment(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const parsed = parseJsonBody(event.body, createPaymentSchema);
  const request = toCreatePaymentRequest(parsed);

  const result = await createPayment({ cognitoSub: identity.sub, request });

  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CREATE_PAYMENT',
  handleCreatePayment,
);
