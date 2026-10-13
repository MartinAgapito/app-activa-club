// GET /dashboard/admin — métricas administrativas del MVP (docs/api/contratos-api.md
// §9, RN-ANL-01..08). Solo `admin`, sin parámetros, solo lectura.
//
// El handler solo autoriza y compone secciones; cada sección vive en su propio
// módulo de `src/dashboard/`:
// - US-057: socios, membresías, reservas pendientes, pagos y notificaciones
//   (`admin-people-metrics.ts`).
// - US-058: reservas por recurso/día/hora y ocupación (por añadir).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { computeAdminPeopleMetrics } from '../../dashboard/admin-people-metrics';
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

  // PUNTO DE EXTENSIÓN (US-058): añadir aquí la sección de reservas y
  // ocupación como una llamada más del Promise.all (por ejemplo
  // `computeAdminReservationMetrics({ now, requestId })`), y propagar su
  // resultado en el cuerpo de abajo. Cada sección es independiente: no
  // comparten consultas ni estado.
  const [people] = await Promise.all([
    computeAdminPeopleMetrics({ now, requestId: ctx.requestId }),
  ]);

  const body = {
    // Valores vacíos hasta US-058: "van vacíos, no ausentes" (US-057, contrato).
    // US-058 los reemplaza con sus cifras reales (y añade `reservationsByHour`
    // y `periods.last30Days`).
    reservationsByResource: {},
    reservationsByDay: [],
    occupancy: [],
    ...people,
  };

  return jsonResponse(200, body);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'ADMIN_DASHBOARD',
  handleAdminDashboard,
);
