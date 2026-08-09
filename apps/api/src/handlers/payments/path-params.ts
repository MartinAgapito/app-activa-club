// Extracción del path parameter `paymentId`, usada por
// `GET /payments/{paymentId}` (docs/api/contratos-api.md §5, US-025). Mismo
// patrón que `../members/path-params.ts`.

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { AppError } from '../../lib/errors';

/** Lee `paymentId` de la ruta; ausente solo si API Gateway no lo resolvió (defensivo). */
export function requirePaymentIdPathParam(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): string {
  const paymentId = event.pathParameters?.['paymentId'];
  if (!paymentId) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro paymentId es obligatorio.');
  }
  return paymentId;
}
