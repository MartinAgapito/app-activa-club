// Query compartida de los planes de membresía disponibles (`GET
// /memberships/plans`, docs/api/contratos-api.md §5).
//
// Centraliza la `queryKey` y el `queryFn` para que las pantallas que
// necesitan los planes (consulta de planes de US-020 y el checkout de
// US-022) compartan la misma entrada de caché de TanStack Query en vez de
// repetir la petición.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { MembershipPlan } from '@activa-club/shared-types';
import { fetchMembershipPlans } from './plans-client';

export const MEMBERSHIP_PLANS_QUERY_KEY = ['memberships', 'plans'] as const;

export function useMembershipPlansQuery(): UseQueryResult<MembershipPlan[]> {
  return useQuery({ queryKey: MEMBERSHIP_PLANS_QUERY_KEY, queryFn: fetchMembershipPlans });
}
