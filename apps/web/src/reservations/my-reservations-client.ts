// Cliente de "Mis reservas" (US-033). Endpoints reales de
// docs/api/contratos-api.md §7: `GET /reservations?scope=me`,
// `GET /reservations/{reservationId}` y `POST /reservations/{reservationId}/cancel`.

import type {
  CancelReservationResponse,
  Paginated,
  Reservation,
  ReservationDetail,
  ReservationStatus,
} from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export const MY_RESERVATIONS_PAGE_SIZE = 20;

export interface ListMyReservationsParams {
  status?: ReservationStatus | undefined;
  cursor?: string | null | undefined;
}

/** Reservas donde el socio autenticado es el titular, ordenadas
 * ascendentemente por `startsAt` y paginadas por cursor. */
export function listMyReservations(
  params: ListMyReservationsParams = {},
): Promise<Paginated<Reservation>> {
  const query = new URLSearchParams({ scope: 'me', limit: String(MY_RESERVATIONS_PAGE_SIZE) });
  if (params.status) {
    query.set('status', params.status);
  }
  if (params.cursor) {
    query.set('cursor', params.cursor);
  }
  return apiRequest<Paginated<Reservation>>(`/reservations?${query.toString()}`);
}

export function fetchReservationDetail(reservationId: string): Promise<ReservationDetail> {
  return apiRequest<ReservationDetail>(`/reservations/${encodeURIComponent(reservationId)}`);
}

export function cancelReservation(reservationId: string): Promise<CancelReservationResponse> {
  return apiRequest<CancelReservationResponse>(
    `/reservations/${encodeURIComponent(reservationId)}/cancel`,
    { method: 'POST' },
  );
}
