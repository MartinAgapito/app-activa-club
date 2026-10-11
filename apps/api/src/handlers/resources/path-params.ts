// Extracción de path parameters de las rutas de mantenimiento de recursos
// (`/resources/{resourceId}/maintenance[/{blockId}]`, US-035). Mismo patrón que
// `../reservations/path-params.ts`.

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { AppError } from '../../lib/errors';

function requirePathParam(event: APIGatewayProxyWithCognitoAuthorizerEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) {
    throw new AppError('VALIDATION_ERROR', `El parámetro ${name} es obligatorio.`);
  }
  return value;
}

export function requireResourceIdPathParam(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): string {
  return requirePathParam(event, 'resourceId');
}

export function requireBlockIdPathParam(event: APIGatewayProxyWithCognitoAuthorizerEvent): string {
  return requirePathParam(event, 'blockId');
}
