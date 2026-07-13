// Envoltorio compartido por cada Lambda-por-endpoint (ADR-0004): registra un
// log estructurado de entrada/salida (ADR-0008) y traduce cualquier error a la
// respuesta estándar de docs/api/contratos-api.md §1.1, sin filtrar detalles
// internos al cliente.

import type { APIGatewayProxyResult } from 'aws-lambda';

import { toErrorResult } from '../lib/errors';
import { jsonResponse } from '../lib/http';
import { logger } from '../lib/logger';

/** Subconjunto mínimo del evento de API Gateway que necesita el envoltorio. */
export interface RoutableEvent {
  httpMethod: string;
  path: string;
  requestContext: { requestId: string };
}

export type RouteHandler<E extends RoutableEvent> = (
  event: E,
  ctx: { requestId: string },
) => Promise<APIGatewayProxyResult>;

/**
 * Envuelve un handler de negocio con logging estructurado y manejo de errores
 * consistente. Cada handler de `src/handlers/**` se define con esta función.
 */
export function withHandler<E extends RoutableEvent>(
  action: string,
  handler: RouteHandler<E>,
): (event: E) => Promise<APIGatewayProxyResult> {
  return async (event: E): Promise<APIGatewayProxyResult> => {
    const requestId = event.requestContext.requestId;
    const route = `${event.httpMethod} ${event.path}`;
    const startedAt = Date.now();

    try {
      const result = await handler(event, { requestId });
      logger.info('request completed', {
        requestId,
        route,
        action,
        outcome: 'SUCCESS',
        latencyMs: Date.now() - startedAt,
        statusCode: result.statusCode,
      });
      return result;
    } catch (error) {
      const { statusCode, body } = toErrorResult(error, requestId);
      logger.error('request failed', {
        requestId,
        route,
        action,
        outcome: 'FAILURE',
        latencyMs: Date.now() - startedAt,
        statusCode,
        errorCode: body.error.code,
      });
      return jsonResponse(statusCode, body);
    }
  };
}
