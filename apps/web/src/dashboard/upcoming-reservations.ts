// Próximas reservas propias para el inicio del socio (US-070).
//
// `GET /reservations?scope=me&from=<ahora>&limit=10` (docs/api/contratos-api.md
// §7): orden ascendente por `startsAt`. El cliente se queda con las activas
// (confirmada, aprobada o pendiente de aprobación) que todavía no terminaron.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Paginated, Reservation, ReservationStatus } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';
import { MY_RESERVATIONS_QUERY_KEY } from '../reservations/my-reservations-query';

export const UPCOMING_RESERVATIONS_LIMIT = 3;
const FETCH_LIMIT = 10;

const ACTIVE_STATUSES: ReservationStatus[] = ['CONFIRMED', 'APPROVED', 'PENDING_APPROVAL'];

export function selectUpcoming(
  reservations: Reservation[],
  now: Date,
  max = UPCOMING_RESERVATIONS_LIMIT,
): Reservation[] {
  return reservations
    .filter(
      (reservation) =>
        ACTIVE_STATUSES.includes(reservation.reservationStatus) &&
        new Date(reservation.endsAt).getTime() > now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, max);
}

export async function fetchUpcomingReservations(now: Date = new Date()): Promise<Reservation[]> {
  const query = new URLSearchParams({
    scope: 'me',
    from: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    limit: String(FETCH_LIMIT),
  });
  const page = await apiRequest<Paginated<Reservation>>(`/reservations?${query.toString()}`);
  return selectUpcoming(page.items, now);
}

/** Cuelga de `['reservations']`: cancelar o reservar la refresca. */
export function useUpcomingReservationsQuery(): UseQueryResult<Reservation[]> {
  return useQuery({
    queryKey: [...MY_RESERVATIONS_QUERY_KEY, 'upcoming'],
    queryFn: () => fetchUpcomingReservations(),
  });
}
