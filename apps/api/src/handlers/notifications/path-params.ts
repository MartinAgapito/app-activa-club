// Extracción del path parameter `notificationId` de
// `POST /notifications/{notificationId}/read` (docs/api/contratos-api.md §8,
// US-041). Mismo patrón que `../reservations/path-params.ts`.

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { AppError } from '../../lib/errors';

/** Lee `notificationId` de la ruta; ausente solo si API Gateway no lo resolvió (defensivo). */
export function requireNotificationIdPathParam(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): string {
  const notificationId = event.pathParameters?.['notificationId'];
  if (!notificationId) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro notificationId es obligatorio.');
  }
  return notificationId;
}
