// Query compartida del perfil propio del socio autenticado (`GET /members/me`,
// docs/api/contratos-api.md §4).
//
// Centraliza la `queryKey` y el `queryFn` para que las pantallas/guards que
// necesitan el `memberStatus` del socio (perfil, guard de estado de cuenta y
// la pantalla de "solicitud en revisión") compartan la misma entrada de
// caché de TanStack Query en vez de repetir la petición: si ya se resolvió
// en un lugar del árbol de rutas, el resto la reutiliza mientras siga
// "fresca" (ver lib/query-client.ts, `staleTime`).

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Member } from '@activa-club/shared-types';
import { fetchMemberProfile } from './profile-client';

export const MEMBER_PROFILE_QUERY_KEY = ['members', 'me'] as const;

export function useMemberProfileQuery(): UseQueryResult<Member> {
  return useQuery({ queryKey: MEMBER_PROFILE_QUERY_KEY, queryFn: fetchMemberProfile });
}
