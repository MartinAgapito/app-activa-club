// POST /notifications/{notificationId}/read — marca una notificación propia
// como leída (docs/api/contratos-api.md §8, US-041, criterios 3/4/5). Solo
// `member`. Idempotente; una notificación ajena o inexistente responde 404.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { readNotification } from '../../notifications/read';
import { requireNotificationIdPathParam } from './path-params';

async function handleReadNotification(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const notificationId = requireNotificationIdPathParam(event);

  const result = await readNotification({ cognitoSub: identity.sub, notificationId });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'READ_NOTIFICATION',
  handleReadNotification,
);
