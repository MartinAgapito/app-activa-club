// GET /health — comprobación pública de disponibilidad del backend.
//
// Handler de referencia (US-009): demuestra el patrón "una Lambda por
// endpoint" (ADR-0004) en su forma más simple — sin autenticación ni acceso a
// datos — envuelta con el middleware compartido de logging/errores. Sirve de
// plantilla mínima para Sprint 1.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { jsonResponse } from '../../lib/http';
import { withHandler } from '../../middleware/with-handler';

async function handleHealth(
  _event: APIGatewayProxyEvent,
  _ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  return jsonResponse(200, { status: 'ok', timestamp: new Date().toISOString() });
}

export const handler = withHandler<APIGatewayProxyEvent>('HEALTH_CHECK', handleHealth);
