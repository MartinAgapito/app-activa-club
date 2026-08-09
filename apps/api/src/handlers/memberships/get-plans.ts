// GET /memberships/plans — planes de membresía disponibles (member, admin),
// docs/api/contratos-api.md §5, US-020.
//
// Sin lógica propia más allá de exponer `getMembershipPlans()`
// (`../../payments/plans.ts`, ya construido por US-021 como la única fuente
// de verdad de montos/moneda): este handler es deliberadamente delgado, el
// contrato exige que el monto nunca lo decida el cliente, así que tampoco
// duplicamos esa tabla acá.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { getMembershipPlans } from '../../payments/plans';

async function handleGetMembershipPlans(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  return jsonResponse(200, { plans: getMembershipPlans() });
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_MEMBERSHIP_PLANS',
  handleGetMembershipPlans,
);
