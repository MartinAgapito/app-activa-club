// Fuentes de datos del inicio del administrador (US-071, US-059).
//
// Cada bloque recibe un `PendingSummary` y no conoce el endpoint. Las
// cantidades exactas salen de `GET /dashboard/admin` (`summaryFromCount`);
// la lista de las reservas por aprobar sigue viniendo de la lista admin
// `PENDING_APPROVAL` (primera página), con la misma clave de caché que la
// pantalla de reservas: las decisiones tomadas allí invalidan este resumen.

import type { AdminReservationListItem } from '@activa-club/shared-types';
import { useAdminReservationsQuery } from '../reservations/admin-reservations-query';
import type { PendingCount } from './pending-count';

export interface PendingSummary<T> extends PendingCount {
  isPending: boolean;
  isError: boolean;
  /** Primera página, en el orden del servidor. */
  items: T[];
  refetch: () => void;
}

/** Resumen con la cantidad exacta que informa el servidor (sin lista). */
export function summaryFromCount(
  query: { isPending: boolean; isError: boolean; refetch: () => unknown },
  count: number | undefined,
): PendingSummary<never> {
  return {
    isPending: query.isPending,
    isError: query.isError,
    items: [],
    count: count ?? 0,
    hasMore: false,
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
