// GET /reservations?scope=me|all&status=&resourceId=&from=&to=&cursor=&limit=
// — listado de reservas, paginado por cursor (docs/api/contratos-api.md §7,
// US-033, criterios 1/2). `scope=me` (default) requiere `member`; `scope=all`
// requiere `admin` (contrato: la lectura administrativa sin restricción de
// titular no es para cualquier socio) — un `member` que pide `scope=all`
// recibe 403 `FORBIDDEN`, resuelto aquí antes de tocar cualquier dato.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listReservationsQuerySchema } from '@activa-club/validation';

import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listReservations } from '../../reservations/list';

async function handleListReservations(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  const query = parseQuery(event.queryStringParameters, listReservationsQuerySchema);
  const scope = query.scope ?? 'me';

  requireRole(identity, scope === 'all' ? ['admin'] : ['member']);

  const result = await listReservations({
    cognitoSub: identity.sub,
    scope,
    ...(query.status !== undefined ? { status: query.status } : {}),
    ...(query.resourceId !== undefined ? { resourceId: query.resourceId } : {}),
    ...(query.from !== undefined ? { from: query.from } : {}),
    ...(query.to !== undefined ? { to: query.to } : {}),
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_RESERVATIONS',
  handleListReservations,
);
