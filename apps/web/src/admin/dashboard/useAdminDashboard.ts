// Hook compartido del dashboard del administrador (US-059, US-060).
//
// Una sola consulta (`GET /dashboard/admin`) alimenta el inicio (`/admin`,
// US-059) y la analítica (`/admin/analytics`, US-060). Ambas pantallas deben
// usar este hook: comparten la clave de caché `['dashboard', 'admin']`, así
// pasar de una a otra no repite la petición y "Actualizar" refresca las dos.
//
// Las acciones que cambian cifras (aprobar solicitudes, decidir reservas,
// registrar pagos) pueden invalidar `ADMIN_DASHBOARD_QUERY_KEY`.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AdminDashboard } from '@activa-club/shared-types';
import { fetchAdminDashboard } from './admin-dashboard-client';

export const ADMIN_DASHBOARD_QUERY_KEY = ['dashboard', 'admin'] as const;

export function useAdminDashboard(): UseQueryResult<AdminDashboard> {
  return useQuery({
    queryKey: ADMIN_DASHBOARD_QUERY_KEY,
    queryFn: fetchAdminDashboard,
  });
}
