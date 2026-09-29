// GET /resources/{resourceId}/availability?date=YYYY-MM-DD — franjas
// disponibles de un recurso para un día (US-029, docs/api/contratos-api.md
// §6). Solo `member`: la disponibilidad es la vista de un socio eligiendo un
// horario antes de crear una reserva (`POST /reservations`, US-030) — a
// diferencia de `GET /resources` (member+admin), esta consulta puntual no es
// parte de la vista administrativa del catálogo.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { availabilityQuerySchema } from '@activa-club/validation';

import { AppError } from '../../lib/errors';
import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { getResourceAvailability } from '../../reservations/availability';

/** Lee `resourceId` de la ruta; ausente solo si API Gateway no lo resolvió (defensivo). */
function requireResourceIdPathParam(event: APIGatewayProxyWithCognitoAuthorizerEvent): string {
  const resourceId = event.pathParameters?.['resourceId'];
  if (!resourceId) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro resourceId es obligatorio.');
  }
  return resourceId;
}

async function handleGetResourceAvailability(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const resourceId = requireResourceIdPathParam(event);
  const { date } = parseQuery(event.queryStringParameters, availabilityQuerySchema);

  const result = await getResourceAvailability({ resourceId, date });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_RESOURCE_AVAILABILITY',
  handleGetResourceAvailability,
);
