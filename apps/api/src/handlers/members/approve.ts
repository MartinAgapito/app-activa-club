// POST /members/{memberId}/approve — aprueba un socio nuevo
// (docs/api/contratos-api.md §4, docs/scrum/historias/US-017-aprobacion-rechazo-socios.md,
// RN-ACT-06/07, RN-ADM-02). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { approveMember } from '../../members/decide';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { requireMemberIdPathParam } from './path-params';

async function handleApproveMember(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const memberId = requireMemberIdPathParam(event);

  const result = await approveMember({
    memberId,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'APPROVE_MEMBER',
  handleApproveMember,
);
