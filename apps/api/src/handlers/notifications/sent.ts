// GET /notifications/sent?cursor=&limit= — historial de notificaciones
// enviadas, manuales y automáticas, con su origen (docs/api/contratos-api.md
// §8, US-048). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listSentNotificationsQuerySchema } from '@activa-club/validation';

import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listSentNotifications } from '../../notifications/sent';

async function handleListSentNotifications(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const query = parseQuery(event.queryStringParameters, listSentNotificationsQuerySchema);

  const result = await listSentNotifications({
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_SENT_NOTIFICATIONS',
  handleListSentNotifications,
);
