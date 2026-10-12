// Mis reservas — consultar y cancelar reservas propias (US-074, sobre US-033).
//
// Pestañas "Próximas" / "Pasadas" (`?tab=`), tabla con paginación por cursor
// y panel lateral de detalle con dirección propia (`?reserva=`), desde donde
// se cancela con una confirmación en ventana.
//
// Consume `GET /reservations?scope=me`, `GET /reservations/{id}` y
// `POST /reservations/{id}/cancel` (docs/api/contratos-api.md §7). La interfaz
// anticipa la regla de 24 horas (RN-RES-10) pero gana el servidor.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  buttonVariants,
  type DataTableColumn,
} from '@activa-club/ui';
import type { Reservation, ReservationStatus } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import { useResourcesQuery } from '../../resources/resources-query';
import { toLoadErrorMessage } from '../../reservations/my-reservations-errors';
import { useMyReservationsQuery } from '../../reservations/my-reservations-query';
import { ReservationDetailPanel } from '../../reservations/ReservationDetailPanel';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';

const NOW_REFRESH_MS = 60_000;

type TabValue = 'proximas' | 'pasadas';

function isTabValue(value: string | null): value is TabValue {
  return value === 'proximas' || value === 'pasadas';
}

/** Reloj de la pantalla: se refresca cada minuto para que el botón de cancelar
 * pase a deshabilitado si el socio deja la pantalla abierta. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function peopleText(reservation: Reservation): string {
  const people = `${reservation.participantCount} ${reservation.participantCount === 1 ? 'persona' : 'personas'}`;
  const guests = reservation.guestCount;
  return guests > 0
    ? `${people}, ${guests} ${guests === 1 ? 'invitado externo' : 'invitados externos'}`
    : people;
}

export function MyReservationsPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const now = useNow();
  const resourcesQuery = useResourcesQuery();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: TabValue = isTabValue(tabParam) ? tabParam : 'proximas';
  const reservationParam = searchParams.get('reserva');

  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('');
  // `true` si el panel se abrió con un paso nuevo en el historial: cerrarlo
  // retrocede ese paso, de modo que "atrás" y la X hacen lo mismo.
  const pushedRef = useRef(false);

  useEffect(() => {
    if (reservationParam === null) {
      pushedRef.current = false;
    }
  }, [reservationParam]);

  const query = useMyReservationsQuery(statusFilter || undefined);

  const resourceNames = useMemo(
    () =>
      new Map(
        (resourcesQuery.data ?? []).map(
          (resource) => [resource.resourceId, resource.name] as const,
        ),
      ),
    [resourcesQuery.data],
  );

  const reservations = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  // Próximas vs. pasadas comparando `startsAt` con la hora actual. El servidor
  // entrega orden ascendente: las próximas lo conservan y las pasadas se
  // muestran de la más reciente a la más antigua.
  const { upcoming, past } = useMemo(() => {
    const nowMs = now.getTime();
    const next: Reservation[] = [];
    const previous: Reservation[] = [];
    for (const reservation of reservations) {
      if (new Date(reservation.startsAt).getTime() >= nowMs) {
        next.push(reservation);
      } else {
        previous.push(reservation);
      }
    }
    return { upcoming: next, past: previous.reverse() };
  }, [reservations, now]);

  function resourceNameOf(resourceId: string): string | null {
    return resourceNames.get(resourceId) ?? null;
  }

  function nameOf(reservation: Reservation): string {
    return resourceNameOf(reservation.resourceId) ?? RESOURCE_TYPE_LABEL[reservation.resourceType];
  }

  function changeTab(value: string) {
    if (!isTabValue(value)) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  }

  function openReservation(reservationId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('reserva', reservationId);
    pushedRef.current = true;
    setSearchParams(next);
  }

  function closePanel() {
    if (pushedRef.current) {
      pushedRef.current = false;
      void navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('reserva');
    setSearchParams(next, { replace: true });
  }

  const loadError = query.isError ? toLoadErrorMessage(query.error) : null;

  const columns: DataTableColumn<Reservation>[] = [
    {
      key: 'date',
      header: 'Fecha',
      render: (reservation) => (
        <span className="capitalize">{formatDateInLima(reservation.startsAt)}</span>
      ),
    },
    {
      key: 'resource',
      header: 'Instalación',
      render: (reservation) => <span className="font-semibold">{nameOf(reservation)}</span>,
    },
    {
      key: 'time',
      header: 'Hora',
      render: (reservation) => (
        <span className="font-display font-semibold tabular-nums">
          {formatTimeRangeInLima(reservation.startsAt, reservation.endsAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (reservation) => (
        <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[reservation.reservationStatus]}>
          {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
        </Badge>
      ),
    },
    { key: 'people', header: 'Personas', render: peopleText },
  ];

  function renderTable(rows: Reservation[], kind: TabValue): ReactNode {
    const filtered = statusFilter !== '';
    const emptyTitle = filtered
      ? 'No hay reservas con ese estado'
      : kind === 'proximas'
        ? 'No tienes reservas próximas'
        : 'No tienes reservas pasadas';
    const emptyDescription = filtered
      ? 'Prueba con otro estado o quita el filtro.'
      : kind === 'proximas'
        ? 'Cuando reserves una instalación aparecerá aquí.'
        : 'Aquí verás tus reservas una vez que hayan pasado.';
    const emptyAction =
      !filtered || query.hasNextPage ? (
        <div className="flex flex-wrap justify-center gap-2">
          {!filtered && kind === 'proximas' ? (
            <Link to="/socio/reservas" className={buttonVariants({ variant: 'primary' })}>
              Reservar una instalación
            </Link>
          ) : null}
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              isLoading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Cargar más
            </Button>
          ) : null}
        </div>
      ) : undefined;

    return (
      <DataTable
        caption={kind === 'proximas' ? 'Reservas próximas' : 'Reservas pasadas'}
        hideCaption
        columns={columns}
        rows={rows}
        getRowKey={(reservation) => reservation.reservationId}
        onRowClick={(reservation) => openReservation(reservation.reservationId)}
        getRowLabel={(reservation) =>
          `${nameOf(reservation)}, ${formatDateInLima(reservation.startsAt)}, ${formatTimeRangeInLima(
            reservation.startsAt,
            reservation.endsAt,
          )}, ${RESERVATION_STATUS_LABEL[reservation.reservationStatus]}. Abrir detalle`
        }
        isLoading={query.isPending}
        loadingLabel="Cargando tus reservas…"
        isError={loadError !== null}
        errorTitle="No pudimos cargar tus reservas"
        errorDescription={loadError?.message}
        retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
        onRetry={loadError?.sessionExpired ? signOut : () => void query.refetch()}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
        emptyAction={emptyAction}
        hasMore={query.hasNextPage}
        onLoadMore={() => void query.fetchNextPage()}
        isLoadingMore={query.isFetchingNextPage}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mis reservas"
        description="Consulta tus reservas y cancela las que ya no vas a usar. Puedes cancelar hasta 24 horas antes del inicio."
        actions={
          <Link to="/socio/reservas" className={buttonVariants({ variant: 'primary' })}>
            Nueva reserva
          </Link>
        }
      />

      <div className="max-w-xs">
        <label htmlFor="my-reservations-status" className="text-sm font-medium text-ink">
          Filtrar por estado
        </label>
        <select
          id="my-reservations-status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | '')}
          className="mt-1 block min-h-11 w-full rounded-control border border-line bg-surface-card px-3 text-sm text-ink focus-ring"
        >
          <option value="">Todas</option>
          {RESERVATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RESERVATION_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Mis reservas">
          <TabsTrigger value="proximas" count={upcoming.length}>
            Próximas
          </TabsTrigger>
          <TabsTrigger value="pasadas" count={past.length}>
            Pasadas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="proximas">{renderTable(upcoming, 'proximas')}</TabsContent>
        <TabsContent value="pasadas">{renderTable(past, 'pasadas')}</TabsContent>
      </Tabs>

      <ReservationDetailPanel
        reservationId={reservationParam}
        now={now}
        resourceNameOf={resourceNameOf}
        onClose={closePanel}
        onSessionExpired={signOut}
      />
    </div>
  );
}
