// Cliente administrativo de reservas — US-034 (bandeja) y US-036 (consulta).
//
// Endpoints reales de docs/api/contratos-api.md §7, todos con rol `admin`:
// `GET /reservations?scope=all`, `POST /reservations/{id}/approve|reject`.
// El detalle (`GET /reservations/{id}`) y la cancelación
// (`POST /reservations/{id}/cancel`) son los mismos endpoints que usa el socio
// y se reutilizan desde `reservations/my-reservations-client.ts`: el servidor
// aplica la regla distinta (sin ventana de 24 h para admin).

import type {
  AdminReservationListItem,
  ApproveReservationResponse,
  Paginated,
  RejectReservationRequest,
  RejectReservationResponse,
  ReservationStatus,
} from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';
import { limaLocalTimeToUtcIso } from '../../lib/format/lima-time';

export const ADMIN_RESERVATIONS_PAGE_SIZE = 20;

export interface AdminReservationFilters {
  status?: ReservationStatus | undefined;
  resourceId?: string | undefined;
  /** Instante UTC ISO inclusivo (`startsAt >= from`). */
  from?: string | undefined;
  /** Instante UTC ISO inclusivo (`startsAt <= to`). */
  to?: string | undefined;
}

export interface ListAdminReservationsParams extends AdminReservationFilters {
  cursor?: string | null | undefined;
}

/** Inicio de un día `YYYY-MM-DD` de Lima, como instante UTC ISO. */
export function startOfDayInLimaUtcIso(date: string): string {
  return limaLocalTimeToUtcIso(date, '00:00');
}

/** Último segundo de un día `YYYY-MM-DD` de Lima, como instante UTC ISO
 * (el servidor trata `to` como inclusivo). */
export function endOfDayInLimaUtcIso(date: string): string {
  return limaLocalTimeToUtcIso(date, '23:59').replace(':00Z', ':59Z');
}

/** `GET /reservations?scope=all`. El servidor exige al menos `status` o
 * `resourceId` (400 en caso contrario): quien llama debe garantizarlo. */
export function listAdminReservations(
  params: ListAdminReservationsParams,
): Promise<Paginated<AdminReservationListItem>> {
  const query = new URLSearchParams({
    scope: 'all',
    limit: String(ADMIN_RESERVATIONS_PAGE_SIZE),
  });
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.resourceId) {
    query.set('resourceId', params.resourceId);
  }
  if (params.from) {
    query.set('from', params.from);
  }
  if (params.to) {
    query.set('to', params.to);
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  return apiRequest<Paginated<AdminReservationListItem>>(`/reservations?${query.toString()}`);
}

/** Aprueba una reserva `PENDING_APPROVAL` (409 `RESERVATION_NOT_PENDING` si ya no lo está). */
export function approveReservation(reservationId: string): Promise<ApproveReservationResponse> {
  return apiRequest<ApproveReservationResponse>(
    `/reservations/${encodeURIComponent(reservationId)}/approve`,
    { method: 'POST' },
  );
}

/** Rechaza una reserva `PENDING_APPROVAL` con motivo obligatorio (3-280). */
export function rejectReservation(
  reservationId: string,
  request: RejectReservationRequest,
): Promise<RejectReservationResponse> {
  return apiRequest<RejectReservationResponse>(
    `/reservations/${encodeURIComponent(reservationId)}/reject`,
    { method: 'POST', body: request },
  );
}
