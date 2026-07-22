// Cliente de solicitudes pendientes de socios nuevos — US-017.
//
// `GET /members?status=PENDING`, `GET /members/{memberId}`,
// `POST /members/{memberId}/approve` y `POST /members/{memberId}/reject`
// (docs/api/contratos-api.md §4). Solo accesible con rol `admin`; la
// autorización real la valida el backend (ADR-0002), este cliente solo
// transporta la solicitud. Reutiliza `apiRequest` (lib/api/http-client.ts),
// que ya normaliza los errores al formato estándar del contrato.

import type {
  ApproveMemberResponse,
  Member,
  MemberSummary,
  Paginated,
  RejectMemberRequest,
} from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Tamaño de página del listado de solicitudes pendientes (criterio de aceptación 1). */
export const PENDING_MEMBERS_PAGE_SIZE = 20;

/** Lista paginada por cursor de socios en estado `PENDING` (criterio de
 * aceptación 1). `cursor` es el `nextCursor` opaco de la página anterior. */
export function fetchPendingMembers(cursor?: string | null): Promise<Paginated<MemberSummary>> {
  const params = new URLSearchParams({
    status: 'PENDING',
    limit: String(PENDING_MEMBERS_PAGE_SIZE),
  });
  if (cursor) {
    params.set('cursor', cursor);
  }
  return apiRequest<Paginated<MemberSummary>>(`/members?${params.toString()}`);
}

/** Detalle completo de un socio, para decidir con más contexto antes de
 * aprobar o rechazar (criterio de aceptación 2). */
export function fetchMemberDetail(memberId: string): Promise<Member> {
  return apiRequest<Member>(`/members/${memberId}`);
}

/** Aprueba una solicitud `PENDING` (criterio de aceptación 3). Devuelve el
 * socio actualizado; 409 `CONFLICT` si ya no estaba `PENDING`. */
export function approveMember(memberId: string): Promise<ApproveMemberResponse> {
  return apiRequest<ApproveMemberResponse>(`/members/${memberId}/approve`, { method: 'POST' });
}

/** Rechaza una solicitud `PENDING` con un motivo obligatorio (criterio de
 * aceptación 4). Devuelve el socio actualizado; 409 `CONFLICT` si ya no
 * estaba `PENDING`. */
export function rejectMember(
  memberId: string,
  request: RejectMemberRequest,
): Promise<ApproveMemberResponse> {
  return apiRequest<ApproveMemberResponse>(`/members/${memberId}/reject`, {
    method: 'POST',
    body: request,
  });
}
