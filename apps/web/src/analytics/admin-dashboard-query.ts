// Consulta compartida de `GET /dashboard/admin`.
//
// La `queryKey` `['dashboard', 'admin']` es la misma que usa el resumen del
// inicio del administrador (US-059): una sola entrada de caché para ambas
// pantallas.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AdminDashboard } from '@activa-club/shared-types';
import { fetchAdminDashboard } from './admin-dashboard-client';

export const ADMIN_DASHBOARD_QUERY_KEY = ['dashboard', 'admin'] as const;

export function useAdminDashboard(): UseQueryResult<AdminDashboard> {
  return useQuery({ queryKey: ADMIN_DASHBOARD_QUERY_KEY, queryFn: fetchAdminDashboard });
}
