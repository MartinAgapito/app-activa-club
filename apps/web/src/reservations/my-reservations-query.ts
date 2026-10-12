// Queries y mutación de "Mis reservas" (US-033).

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  CancelReservationResponse,
  Paginated,
  Reservation,
  ReservationDetail,
  ReservationStatus,
} from '@activa-club/shared-types';
import {
  cancelReservation,
  fetchReservationDetail,
  listMyReservations,
} from './my-reservations-client';

/** Prefijo común: invalidarlo refresca la lista y los detalles. */
export const MY_RESERVATIONS_QUERY_KEY = ['reservations'] as const;

export function useMyReservationsQuery(
  status: ReservationStatus | undefined,
): UseInfiniteQueryResult<InfiniteData<Paginated<Reservation>, string | null>> {
  return useInfiniteQuery({
    queryKey: [...MY_RESERVATIONS_QUERY_KEY, 'mine', { status: status ?? null }],
    queryFn: ({ pageParam }) => listMyReservations({ status, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

export function useReservationDetailQuery(
  reservationId: string,
  enabled = true,
): UseQueryResult<ReservationDetail> {
  return useQuery({
    queryKey: [...MY_RESERVATIONS_QUERY_KEY, 'detail', reservationId],
    queryFn: () => fetchReservationDetail(reservationId),
    enabled,
  });
}

export function useCancelReservationMutation(): UseMutationResult<
  CancelReservationResponse,
  Error,
  string
> {
  return useMutation({ mutationFn: (reservationId) => cancelReservation(reservationId) });
}
