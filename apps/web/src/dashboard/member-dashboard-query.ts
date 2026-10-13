// Consulta única del inicio del socio (US-056). Cuelga de `['dashboard']`; las
// pantallas que cambian membresía, reservas o avisos la invalidan con
// `MEMBER_DASHBOARD_QUERY_KEY`.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MemberDashboard } from '@activa-club/shared-types';
import { fetchMemberDashboard } from './member-dashboard-client';

export const MEMBER_DASHBOARD_QUERY_KEY = ['dashboard', 'member'] as const;

export function useMemberDashboardQuery(): UseQueryResult<MemberDashboard> {
  return useQuery({ queryKey: MEMBER_DASHBOARD_QUERY_KEY, queryFn: fetchMemberDashboard });
}
