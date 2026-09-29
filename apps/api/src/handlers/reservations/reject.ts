// POST /reservations/{reservationId}/reject — rechaza una reserva de
// parrilla/salón social pendiente con un motivo obligatorio
// (docs/api/contratos-api.md §7, US-034, criterios 3/4/5/9/10/11,
// RN-RES-02/05). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { rejectReservationSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { rejectReservation } from '../../reservations/reject';
import { requireReservationIdPathParam } from './path-params';

async function handleRejectReservation(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const reservationId = requireReservationIdPathParam(event);
  const { reason } = parseJsonBody(event.body, rejectReservationSchema);

  const result = await rejectReservation({
    reservationId,
    reason,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'REJECT_RESERVATION',
  handleRejectReservation,
);
