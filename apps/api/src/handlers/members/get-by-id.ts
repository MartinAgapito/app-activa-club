// GET /members/{memberId} — detalle completo de un socio (docs/api/contratos-api.md
// §4, docs/scrum/historias/US-017-aprobacion-rechazo-socios.md). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getDocumentClient } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse } from '../../lib/http';
import { getMemberById } from '../../members/repository';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { requireMemberIdPathParam } from './path-params';

async function handleGetMemberById(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const memberId = requireMemberIdPathParam(event);

  const member = await getMemberById(getDocumentClient(), memberId);
  if (!member) {
    throw new AppError('NOT_FOUND', 'No se encontró el socio indicado.');
  }

  return jsonResponse(200, member);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_MEMBER_BY_ID',
  handleGetMemberById,
);
