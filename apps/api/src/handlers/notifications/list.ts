// GET /notifications?unread=&cursor=&limit= — bandeja del socio autenticado,
// de la más reciente a la más antigua, paginada por cursor
// (docs/api/contratos-api.md §8, US-041, criterios 1/2/5). Solo `member`; la
// identidad sale siempre del token.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listNotificationsQuerySchema } from '@activa-club/validation';

import { jsonResponse, parseQuery } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listNotifications } from '../../notifications/list';

async function handleListNotifications(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const query = parseQuery(event.queryStringParameters, listNotificationsQuerySchema);

  const result = await listNotifications({
    cognitoSub: identity.sub,
    ...(query.unread !== undefined ? { unreadOnly: query.unread === 'true' } : {}),
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_NOTIFICATIONS',
  handleListNotifications,
);
