// Extracción del path parameter `memberId`, compartida por los endpoints
// `GET /members/{memberId}`, `POST /members/{memberId}/approve` y
// `POST /members/{memberId}/reject` (docs/api/contratos-api.md §4).

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { AppError } from '../../lib/errors';

/** Lee `memberId` de la ruta; ausente solo si API Gateway no lo resolvió (defensivo). */
export function requireMemberIdPathParam(event: APIGatewayProxyWithCognitoAuthorizerEvent): string {
  const memberId = event.pathParameters?.['memberId'];
  if (!memberId) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro memberId es obligatorio.');
  }
  return memberId;
}
