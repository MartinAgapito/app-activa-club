// GET /members/lookup?dni= — resuelve un socio por DNI exacto para agregarlo
// como participante de una reserva (docs/api/contratos-api.md §4, RN-RES-03,
// ADR-0009, US-031). Roles `member` y `admin`: es el único endpoint del rol
// `member` que devuelve datos de otro socio, deliberadamente acotado.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { memberLookupQuerySchema } from '@activa-club/validation';

import { jsonResponse, parseQuery } from '../../lib/http';
import { lookupMemberByDni } from '../../members/lookup';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleMemberLookup(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const { dni } = parseQuery(event.queryStringParameters, memberLookupQuerySchema);
  const result = await lookupMemberByDni({ dni });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'MEMBER_LOOKUP',
  handleMemberLookup,
);
