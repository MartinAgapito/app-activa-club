// GET /guests/lookup?dni= — resuelve el perfil de un invitado externo ya
// registrado por DNI exacto (docs/api/contratos-api.md §7, RN-RES-03/04,
// ADR-0009, US-031). Roles `member` y `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { guestLookupQuerySchema } from '@activa-club/validation';

import { lookupGuestByDni } from '../../guests/lookup';
import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleGuestLookup(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const { dni } = parseQuery(event.queryStringParameters, guestLookupQuerySchema);
  const result = await lookupGuestByDni({ dni });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GUEST_LOOKUP',
  handleGuestLookup,
);
