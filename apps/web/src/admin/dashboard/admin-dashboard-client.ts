// Cliente de `GET /dashboard/admin` (US-057, US-058; contrato en
// docs/api/contratos-api.md §9). Solo `admin`; sin parámetros: los períodos
// son fijos y los calcula el servidor en `America/Lima`.

import type { AdminDashboard } from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';

export function fetchAdminDashboard(): Promise<AdminDashboard> {
  return apiRequest<AdminDashboard>('/dashboard/admin');
}
