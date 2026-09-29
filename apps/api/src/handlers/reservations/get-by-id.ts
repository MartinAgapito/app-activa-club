// GET /reservations/{reservationId} — detalle de una reserva
// (docs/api/contratos-api.md §7, US-033, criterios 3/4). `member`: solo su
// propia reserva (titular); `admin`: cualquiera. La distinción "propia vs.
// ajena" se resuelve siempre en `../../reservations/get-by-id.ts`, nunca
// aquí.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { getReservationDetail } from '../../reservations/get-by-id';
import { requireReservationIdPathParam } from './path-params';

async function handleGetReservationById(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const reservationId = requireReservationIdPathParam(event);

  const result = await getReservationDetail({
    cognitoSub: identity.sub,
    roles: identity.roles,
    reservationId,
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_RESERVATION_BY_ID',
  handleGetReservationById,
);
