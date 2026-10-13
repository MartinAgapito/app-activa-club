// Cliente de la analítica del administrador — US-060.
//
// `GET /dashboard/admin` (docs/api/contratos-api.md §9, rol `admin`, sin
// parámetros). La pantalla de analítica usa solo `periods.last30Days`,
// `reservationsByResource`, `reservationsByDay`, `reservationsByHour` y
// `occupancy`.

import type { AdminDashboard } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/dashboard/admin');
}
