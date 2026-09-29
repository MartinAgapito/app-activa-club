// Extracción del path parameter `reservationId`, usada por
// `GET /reservations/{reservationId}` y `POST /reservations/{reservationId}/cancel`
// (docs/api/contratos-api.md §7, US-033). Mismo patrón que
// `../payments/path-params.ts`.

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { AppError } from '../../lib/errors';

/** Lee `reservationId` de la ruta; ausente solo si API Gateway no lo resolvió (defensivo). */
export function requireReservationIdPathParam(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): string {
  const reservationId = event.pathParameters?.['reservationId'];
  if (!reservationId) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro reservationId es obligatorio.');
  }
  return reservationId;
}
