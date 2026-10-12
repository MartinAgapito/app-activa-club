// POST /notifications — publica un aviso segmentado a la bandeja de los socios
// (docs/api/contratos-api.md §8, US-048, RN-ADM-06, RN-NOT-03). Solo `admin`.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { createNotificationSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { publishNotification } from '../../notifications/publish';

async function handleCreateNotification(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
  ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const body = parseJsonBody(event.body, createNotificationSchema);

  const result = await publishNotification({
    segment: body.segment,
    title: body.title,
    body: body.body,
    alsoEmail: body.alsoEmail,
    ...(body.targetMemberId !== undefined ? { targetMemberId: body.targetMemberId } : {}),
    ...(body.resourceId !== undefined ? { resourceId: body.resourceId } : {}),
    actor: { actorId: identity.sub, actorRole: 'admin' },
    requestId: ctx.requestId,
  });

  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CREATE_NOTIFICATION',
  handleCreateNotification,
);
