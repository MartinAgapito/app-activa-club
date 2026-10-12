// Pestaña "Por aprobar" — US-077 (criterio 2; antes US-034).
//
// Tabla de `GET /reservations?scope=all&status=PENDING_APPROVAL` (el servidor
// ordena por inicio ascendente) con contador y las acciones "Aprobar" y
// "Rechazar" por fila. La consulta vive en la pantalla para alimentar también
// el contador de la pestaña.

import { Button } from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { AdminReservationsTable } from './AdminReservationsTable';
import { toAdminLoadError } from './admin-reservations-errors';
import type { useAdminReservationsQuery } from './admin-reservations-query';

interface PendingReservationsInboxProps {
  query: ReturnType<typeof useAdminReservationsQuery>;
  now: Date;
  /** `resourceId` -> nombre de la instalación. */
  resourceNames: ReadonlyMap<string, string>;
  onOpen: (reservation: AdminReservationListItem) => void;
  onApprove: (reservation: AdminReservationListItem) => void;
  onReject: (reservation: AdminReservationListItem) => void;
}

export function PendingReservationsInbox({
  query,
  now,
  resourceNames,
  onOpen,
  onApprove,
  onReject,
}: PendingReservationsInboxProps) {
  const { signOut } = useAuth();
  const reservations = query.data?.pages.flatMap((page) => page.items) ?? [];
  const loadError = query.isError ? toAdminLoadError(query.error) : null;
  const pendingCount = reservations.length;
  const countLabel = query.hasNextPage ? `${pendingCount} o más` : String(pendingCount);

  return (
    <section aria-label="Solicitudes pendientes" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Parrillas y salón social requieren tu aprobación. Las más próximas primero.
        </p>
        {query.data ? (
          <p role="status" className="text-sm font-medium text-ink">
            {pendingCount === 0
              ? 'Sin solicitudes pendientes'
              : `${countLabel} ${
                  pendingCount === 1 && !query.hasNextPage
                    ? 'solicitud pendiente'
                    : 'solicitudes pendientes'
                }`}
          </p>
        ) : null}
      </div>

      <AdminReservationsTable
        caption="Solicitudes pendientes de aprobación"
        variant="pending"
        rows={reservations}
        now={now}
        resourceNames={resourceNames}
        onOpen={onOpen}
        renderActions={(reservation) => (
          <>
            <Button size="sm" variant="positive" onClick={() => onApprove(reservation)}>
              Aprobar
            </Button>
            <Button size="sm" variant="danger" onClick={() => onReject(reservation)}>
              Rechazar
            </Button>
          </>
        )}
        isLoading={query.isPending}
        loadingLabel="Cargando solicitudes pendientes…"
        isError={loadError !== null}
        errorTitle="No pudimos cargar las solicitudes"
        errorDescription={loadError?.message}
        onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
        retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
        emptyTitle="No hay solicitudes pendientes"
        emptyDescription="Todas las solicitudes de parrillas y salón social ya fueron resueltas."
        hasMore={Boolean(query.hasNextPage)}
        onLoadMore={() => void query.fetchNextPage()}
        isLoadingMore={query.isFetchingNextPage}
      />
    </section>
  );
}
