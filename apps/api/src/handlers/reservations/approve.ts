// POST /reservations/{reservationId}/approve — aprueba una reserva de
// parrilla/salón social pendiente (docs/api/contratos-api.md §7, US-034,
// criterios 2/5/6/7/8/11, RN-RES-02). Solo `admin`.
//
// Sin cuerpo de solicitud significativo (a diferencia de `reject`, que exige
// un `reason`): aprobar no necesita ningún dato adicional del cliente.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { approveReservation } from '../../reservations/approve';
import { requireReservationIdPathParam } from './path-params';

async function handleApproveReservation(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const reservationId = requireReservationIdPathParam(event);

  const result = await approveReservation({
    reservationId,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'APPROVE_RESERVATION',
  handleApproveReservation,
);
