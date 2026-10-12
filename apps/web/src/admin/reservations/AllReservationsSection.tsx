// Pestaña "Todas" — US-077 (criterio 3; antes US-036).
//
// `GET /reservations?scope=all` con filtros combinables por estado,
// instalación y rango de fechas (en hora de Lima), paginación por cursor con
// "Cargar más". El servidor exige al menos `status` o `resourceId`: la pantalla
// lo impone y no consulta mientras falten ambos. Los filtros viven en la URL.
// Abrir una fila muestra el detalle, donde se cancela (US-077 criterio 5).

import { useId, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, Input } from '@activa-club/ui';
import type { AdminReservationListItem, ReservationStatus } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';
import { AdminReservationsTable } from './AdminReservationsTable';
import {
  endOfDayInLimaUtcIso,
  startOfDayInLimaUtcIso,
  type AdminReservationFilters,
} from './admin-reservations-client';
import { toAdminLoadError } from './admin-reservations-errors';
import { useAdminReservationsQuery } from './admin-reservations-query';

const SELECT_CLASS =
  'mt-1 block min-h-11 w-full rounded-control border border-line-strong bg-surface-card px-3 text-sm text-ink focus-ring';

const DEFAULT_STATUS: ReservationStatus = 'CONFIRMED';

interface AllReservationsSectionProps {
  now: Date;
  resourceNames: ReadonlyMap<string, string>;
  onOpen: (reservation: AdminReservationListItem) => void;
}

export function AllReservationsSection({
  now,
  resourceNames,
  onOpen,
}: AllReservationsSectionProps) {
  const { signOut } = useAuth();
  const ids = useId();
  const [params, setParams] = useSearchParams();

  // `estado` ausente = confirmadas; `estado=` (vacío) = "Todos los estados".
  const rawStatus = params.get('estado');
  const status: ReservationStatus | '' =
    rawStatus === null
      ? DEFAULT_STATUS
      : (RESERVATION_STATUSES.find((value) => value === rawStatus) ?? '');
  const resourceId = params.get('instalacion') ?? '';
  const fromDate = params.get('desde') ?? '';
  const toDate = params.get('hasta') ?? '';

  function setFilter(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (key !== 'estado' && value === '') {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        next.delete('reserva');
        return next;
      },
      { replace: true },
    );
  }

  function clearFilters() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        for (const key of ['estado', 'instalacion', 'desde', 'hasta']) {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  const hasRequiredFilter = status !== '' || resourceId !== '';
  const rangeInvalid = fromDate !== '' && toDate !== '' && fromDate > toDate;
  const queryEnabled = hasRequiredFilter && !rangeInvalid;

  const filters: AdminReservationFilters = {
    status: status || undefined,
    resourceId: resourceId || undefined,
    from: fromDate ? startOfDayInLimaUtcIso(fromDate) : undefined,
    to: toDate ? endOfDayInLimaUtcIso(toDate) : undefined,
  };

  const query = useAdminReservationsQuery(filters, queryEnabled);
  const reservations = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  const loadError = query.isError ? toAdminLoadError(query.error) : null;
  const resourceOptions = useMemo(
    () => Array.from(resourceNames.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [resourceNames],
  );

  const hasActiveFilters =
    status !== DEFAULT_STATUS || resourceId !== '' || fromDate !== '' || toDate !== '';

  return (
    <section aria-label="Todas las reservas" className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Combina estado, instalación y fechas (hora de Lima). Debes elegir al menos un estado o una
        instalación.
      </p>

      <Card compact>
        <form
          aria-label="Filtros de reservas"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => event.preventDefault()}
        >
          <div>
            <label htmlFor={`${ids}-status`} className="text-sm font-medium text-ink">
              Estado
            </label>
            <select
              id={`${ids}-status`}
              value={status}
              onChange={(event) => setFilter('estado', event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Todos los estados</option>
              {RESERVATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {RESERVATION_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-resource`} className="text-sm font-medium text-ink">
              Instalación
            </label>
            <select
              id={`${ids}-resource`}
              value={resourceId}
              onChange={(event) => setFilter('instalacion', event.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">Todas las instalaciones</option>
              {resourceOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <Input
            type="date"
            label="Desde"
            value={fromDate}
            onChange={(event) => setFilter('desde', event.target.value)}
          />
          <Input
            type="date"
            label="Hasta"
            value={toDate}
            onChange={(event) => setFilter('hasta', event.target.value)}
            errorMessage={
              rangeInvalid ? 'La fecha "Hasta" no puede ser anterior a "Desde".' : undefined
            }
          />
        </form>
        {hasActiveFilters ? (
          <Button type="button" variant="ghost" className="mt-3" onClick={clearFilters}>
            Restablecer filtros
          </Button>
        ) : null}
      </Card>

      {!hasRequiredFilter ? (
        <EmptyState
          title="Elige un estado o una instalación"
          description="Para consultar reservas necesitas filtrar al menos por estado o por instalación."
        />
      ) : null}

      {queryEnabled ? (
        <AdminReservationsTable
          caption="Todas las reservas"
          variant="all"
          rows={reservations}
          now={now}
          resourceNames={resourceNames}
          onOpen={onOpen}
          isLoading={query.isPending}
          loadingLabel="Cargando reservas…"
          isError={loadError !== null}
          errorTitle="No pudimos cargar las reservas"
          errorDescription={loadError?.message}
          onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
          retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
          emptyTitle="No hay reservas con esos filtros"
          emptyDescription="Prueba con otro estado, otra instalación u otro rango de fechas."
          hasMore={Boolean(query.hasNextPage)}
          onLoadMore={() => void query.fetchNextPage()}
          isLoadingMore={query.isFetchingNextPage}
        />
      ) : null}
    </section>
  );
}
