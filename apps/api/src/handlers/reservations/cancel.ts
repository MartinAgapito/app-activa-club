// POST /reservations/{reservationId}/cancel — cancela una reserva propia
// (docs/api/contratos-api.md §7, US-033, criterios 5-12, RN-RES-10). Solo
// `member` por ahora: el contrato también admite `admin` en esta misma ruta
// (cancelación sin la restricción de 24 horas), pero esa rama es US-036 y se
// agrega ahí, no aquí (ver cabecera de `../../reservations/cancel.ts`).
//
// Sin cuerpo de solicitud significativo (`cancelReservationSchema` en
// `packages/validation` es `{}` opcional): no se parsea `event.body`, para no
// exigir que el cliente envíe un JSON vacío cuando no manda nada.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { cancelReservation } from '../../reservations/cancel';
import { requireReservationIdPathParam } from './path-params';

async function handleCancelReservation(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const reservationId = requireReservationIdPathParam(event);

  const result = await cancelReservation({ cognitoSub: identity.sub, reservationId });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CANCEL_RESERVATION',
  handleCancelReservation,
);
