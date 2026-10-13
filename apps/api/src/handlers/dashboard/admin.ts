// GET /dashboard/admin — métricas administrativas del MVP (docs/api/contratos-api.md
// §9). Solo `admin`; sin parámetros.
//
// Handler compartido por US-057 (socios, membresías, pagos, notificaciones) y
// US-058 (reservas y ocupación). Cada historia aporta su sección como una
// función sin handler y este archivo solo las compone:
//   - US-058: `getAdminReservationMetrics` (`../../dashboard/admin-reservation-metrics.ts`)
//     devuelve `periods`, `reservationsByResource`, `reservationsByDay`,
//     `reservationsByHour` y `occupancy`.
//   - US-057: sus campos se agregan al objeto de la respuesta (los de US-058 no
//     cambian).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getAdminReservationMetrics } from '../../dashboard/admin-reservation-metrics';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleGetAdminDashboard(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const reservationMetrics = await getAdminReservationMetrics();

  return jsonResponse(200, { ...reservationMetrics });
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_ADMIN_DASHBOARD',
  handleGetAdminDashboard,
);
