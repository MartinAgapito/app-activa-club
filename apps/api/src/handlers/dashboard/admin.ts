// GET /dashboard/admin — métricas administrativas del MVP (docs/api/contratos-api.md
// §9, RN-ANL-01..08). Solo `admin`, sin parámetros, solo lectura.
//
// El handler solo autoriza y compone secciones; cada sección vive en su propio
// módulo de `src/dashboard/`:
// - US-057: socios, membresías, reservas pendientes, pagos y notificaciones
//   (`admin-people-metrics.ts`).
// - US-058: reservas por recurso/día/hora y ocupación
//   (`admin-reservation-metrics.ts`).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { computeAdminPeopleMetrics } from '../../dashboard/admin-people-metrics';
import { getAdminReservationMetrics } from '../../dashboard/admin-reservation-metrics';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleAdminDashboard(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
  ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const now = new Date();

  // Cada sección es independiente: no comparten consultas ni estado.
  const [people, reservations] = await Promise.all([
    computeAdminPeopleMetrics({ now, requestId: ctx.requestId }),
    getAdminReservationMetrics({ now }),
  ]);

  const body = {
    ...people,
    ...reservations,
    // Cada sección calcula sus propios periodos: se unen (`currentMonth` y
    // `last30Days`) para que el cuerpo declare el rango de cada cifra.
    periods: { ...people.periods, ...reservations.periods },
  };

  return jsonResponse(200, body);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'ADMIN_DASHBOARD',
  handleAdminDashboard,
);
