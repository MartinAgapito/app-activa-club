// GET /dashboard/member — resumen personal del socio autenticado en una sola
// consulta (docs/api/contratos-api.md §9, US-055). Solo `member`; la identidad
// sale siempre del token, sin parámetros.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getMemberDashboard } from '../../dashboard/member';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleGetMemberDashboard(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const dashboard = await getMemberDashboard({ cognitoSub: identity.sub });

  return jsonResponse(200, dashboard);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_MEMBER_DASHBOARD',
  handleGetMemberDashboard,
);
