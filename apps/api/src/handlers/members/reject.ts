// POST /members/{memberId}/reject — rechaza un socio nuevo con un motivo
// obligatorio (docs/api/contratos-api.md §4,
// docs/scrum/historias/US-017-aprobacion-rechazo-socios.md, RN-ADM-02). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { rejectMemberSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { rejectMember } from '../../members/decide';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { requireMemberIdPathParam } from './path-params';

async function handleRejectMember(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const memberId = requireMemberIdPathParam(event);
  const { reason } = parseJsonBody(event.body, rejectMemberSchema);

  const result = await rejectMember({
    memberId,
    reason,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'REJECT_MEMBER',
  handleRejectMember,
);
