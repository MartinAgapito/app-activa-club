// GET /resources/{resourceId}/maintenance — lista los bloqueos por
// mantenimiento de un recurso (docs/api/contratos-api.md §6, US-035, criterio
// 13). Solo `admin`. Query opcional `from`/`to`; por defecto, vigentes y
// futuros. Sin paginación (volumen mínimo por recurso).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listMaintenanceQuerySchema } from '@activa-club/validation';

import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listMaintenanceBlocks } from '../../resources/maintenance';
import { requireResourceIdPathParam } from './path-params';

async function handleListMaintenance(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const resourceId = requireResourceIdPathParam(event);
  const { from, to } = parseQuery(event.queryStringParameters, listMaintenanceQuerySchema);

  const result = await listMaintenanceBlocks({ resourceId, from, to });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_MAINTENANCE',
  handleListMaintenance,
);
