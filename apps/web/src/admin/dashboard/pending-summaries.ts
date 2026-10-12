// Fuentes de datos del inicio del administrador (US-071).
//
// Cada bloque recibe un `PendingSummary` y no conoce el endpoint: cuando exista
// `GET /dashboard/admin` (US-057/US-059) basta con reemplazar el cuerpo de
// estos hooks por las cifras exactas, sin reescribir bloques ni página.
//
// Usan las mismas claves de caché que las pantallas de destino
// (`['members','pending']` y la lista admin `PENDING_APPROVAL`): entrar a
// "Solicitudes" o "Reservas" reutiliza lo ya cargado y las decisiones tomadas
// allí invalidan este resumen. Solo se usa la primera página.

import { useInfiniteQuery } from '@tanstack/react-query';
import type { AdminReservationListItem, MemberSummary } from '@activa-club/shared-types';
import { fetchPendingMembers } from '../pending-members-client';
import { useAdminReservationsQuery } from '../reservations/admin-reservations-query';
import type { PendingCount } from './pending-count';

export interface PendingSummary<T> extends PendingCount {
  isPending: boolean;
  isError: boolean;
  /** Primera página, en el orden del servidor. */
  items: T[];
  refetch: () => void;
}

export function usePendingMembersSummary(): PendingSummary<MemberSummary> {
  const query = useInfiniteQuery({
    queryKey: ['members', 'pending'],
    queryFn: ({ pageParam }) => fetchPendingMembers(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const firstPage = query.data?.pages[0];
  return {
    isPending: query.isPending,
    isError: query.isError && !firstPage,
    items: firstPage?.items ?? [],
    count: firstPage?.items.length ?? 0,
    hasMore: firstPage?.nextCursor != null,
    refetch: () => void query.refetch(),
  };
}

export function usePendingReservationsSummary(): PendingSummary<AdminReservationListItem> {
  const query = useAdminReservationsQuery({ status: 'PENDING_APPROVAL' });
  const firstPage = query.data?.pages[0];
  return {
    isPending: query.isPending,
    isError: query.isError && !firstPage,
    items: firstPage?.items ?? [],
    count: firstPage?.items.length ?? 0,
    hasMore: firstPage?.nextCursor != null,
    refetch: () => void query.refetch(),
  };
}
