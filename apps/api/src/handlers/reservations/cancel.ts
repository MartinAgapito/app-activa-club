// POST /reservations/{reservationId}/cancel — cancela una reserva
// (docs/api/contratos-api.md §7, US-033, RN-RES-10). `member` cancela su propia
// reserva con la restricción de 24 horas; `admin` (US-036, criterio 10) puede
// cancelar cualquier reserva sin ella (ver `../../reservations/cancel.ts`).
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
  requireRole(identity, ['member', 'admin']);

  const reservationId = requireReservationIdPathParam(event);

  const result = await cancelReservation({
    cognitoSub: identity.sub,
    reservationId,
    actorRole: identity.roles.includes('admin') ? 'admin' : 'member',
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CANCEL_RESERVATION',
  handleCancelReservation,
);
