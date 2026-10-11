// Queries y mutaciones administrativas de reservas (US-034, US-036).

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type {
  AdminReservationListItem,
  ApproveReservationResponse,
  CancelReservationResponse,
  Paginated,
  RejectReservationResponse,
  ReservationDetail,
} from '@activa-club/shared-types';
import {
  cancelReservation,
  fetchReservationDetail,
} from '../../reservations/my-reservations-client';
import {
  approveReservation,
  listAdminReservations,
  rejectReservation,
  type AdminReservationFilters,
} from './admin-reservations-client';

/** Prefijo común: invalidarlo refresca bandeja, consulta y detalles admin. */
export const ADMIN_RESERVATIONS_QUERY_KEY = ['admin-reservations'] as const;

/** Refresca todo lo que una decisión sobre una reserva puede dejar viejo: la
 * bandeja y la consulta admin, "Mis reservas" del socio y la disponibilidad
 * del recurso (aprobar no cambia la franja; rechazar/cancelar la libera). */
export function useRefreshAfterReservationChange(): (resourceId: string) => void {
  const queryClient = useQueryClient();
  return (resourceId: string) => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_RESERVATIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['reservations'] });
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  };
}

export function useAdminReservationsQuery(
  filters: AdminReservationFilters,
  enabled = true,
): UseInfiniteQueryResult<InfiniteData<Paginated<AdminReservationListItem>, string | null>> {
  return useInfiniteQuery({
    queryKey: [
      ...ADMIN_RESERVATIONS_QUERY_KEY,
      'list',
      {
        status: filters.status ?? null,
        resourceId: filters.resourceId ?? null,
        from: filters.from ?? null,
        to: filters.to ?? null,
      },
    ],
    queryFn: ({ pageParam }) => listAdminReservations({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
}

export function useAdminReservationDetailQuery(
  reservationId: string,
): UseQueryResult<ReservationDetail> {
  return useQuery({
    queryKey: [...ADMIN_RESERVATIONS_QUERY_KEY, 'detail', reservationId],
    queryFn: () => fetchReservationDetail(reservationId),
  });
}

export function useApproveReservationMutation(): UseMutationResult<
  ApproveReservationResponse,
  Error,
  string
> {
  return useMutation({ mutationFn: (reservationId) => approveReservation(reservationId) });
}

export interface RejectReservationVariables {
  reservationId: string;
  reason: string;
}

export function useRejectReservationMutation(): UseMutationResult<
  RejectReservationResponse,
  Error,
  RejectReservationVariables
> {
  return useMutation({
    mutationFn: ({ reservationId, reason }) => rejectReservation(reservationId, { reason }),
  });
}

export function useAdminCancelReservationMutation(): UseMutationResult<
  CancelReservationResponse,
  Error,
  string
> {
  return useMutation({ mutationFn: (reservationId) => cancelReservation(reservationId) });
}
