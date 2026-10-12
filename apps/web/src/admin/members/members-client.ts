// Cliente del padrón de socios del administrador — US-051.
//
// `GET /members?status=&cursor=&limit=` (docs/api/contratos-api.md §4): el
// filtro `status` es obligatorio en el servidor (patrón de acceso por estado).
// El detalle (`GET /members/{memberId}`) y la resolución por DNI
// (`GET /members/lookup?dni=`) ya tienen cliente en
// `admin/pending-members-client.ts` y `reservations/reservations-client.ts`.

import type { MemberStatus, MemberSummary, Paginated } from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';

export const MEMBERS_PAGE_SIZE = 20;

/** Página de socios en un estado de cuenta; `cursor` es el `nextCursor`
 * opaco de la página anterior. */
export function fetchMembersByStatus(
  status: MemberStatus,
  cursor?: string | null,
): Promise<Paginated<MemberSummary>> {
  const params = new URLSearchParams({ status, limit: String(MEMBERS_PAGE_SIZE) });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return apiRequest<Paginated<MemberSummary>>(`/members?${params.toString()}`);
}
