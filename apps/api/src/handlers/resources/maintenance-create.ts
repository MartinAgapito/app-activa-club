// POST /resources/{resourceId}/maintenance — bloquea un recurso por una
// ventana de mantenimiento (docs/api/contratos-api.md §6, US-035, RN-RES-11).
// Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { createMaintenanceSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { createMaintenanceBlock } from '../../resources/maintenance';
import { requireResourceIdPathParam } from './path-params';

async function handleCreateMaintenance(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const resourceId = requireResourceIdPathParam(event);
  const body = parseJsonBody(event.body, createMaintenanceSchema);

  const result = await createMaintenanceBlock({
    resourceId,
    startsAt: body.startsAt,
    endsAt: body.endsAt,
    reason: body.reason,
    actor: { actorId: identity.sub, actorRole: 'admin' },
  });

  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CREATE_MAINTENANCE',
  handleCreateMaintenance,
);
