// PATCH /resources/{resourceId} — ajusta aforo, horario y estado de una
// instalación (docs/api/contratos-api.md §6, US-036). Solo `admin`.
//
// El esquema es estricto: `blockMinutes`, `type`, `name` y `requiresApproval`
// no se editan (criterio 7) y un cuerpo vacío o con campos extra devuelve 400.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { updateResourceSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { updateResource } from '../../resources/update';
import { requireResourceIdPathParam } from './path-params';

async function handleUpdateResource(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
  ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const resourceId = requireResourceIdPathParam(event);
  const body = parseJsonBody(event.body, updateResourceSchema);

  const result = await updateResource({
    resourceId,
    changes: {
      ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
      ...(body.opensAt !== undefined ? { opensAt: body.opensAt } : {}),
      ...(body.closesAt !== undefined ? { closesAt: body.closesAt } : {}),
      ...(body.resourceStatus !== undefined ? { resourceStatus: body.resourceStatus } : {}),
    },
    actor: { actorId: identity.sub, actorRole: 'admin' },
    requestId: ctx.requestId,
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'UPDATE_RESOURCE',
  handleUpdateResource,
);
