// DELETE /resources/{resourceId}/maintenance/{blockId} — libera un bloqueo por
// mantenimiento (docs/api/contratos-api.md §6, US-035, criterios 6/7). Solo
// `admin`. Responde 204 sin cuerpo.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { releaseMaintenanceBlock } from '../../resources/maintenance';
import { requireBlockIdPathParam, requireResourceIdPathParam } from './path-params';

async function handleDeleteMaintenance(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const resourceId = requireResourceIdPathParam(event);
  const blockId = requireBlockIdPathParam(event);

  await releaseMaintenanceBlock({
    resourceId,
    blockId,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return { statusCode: 204, headers: {}, body: '' };
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'DELETE_MAINTENANCE',
  handleDeleteMaintenance,
);
