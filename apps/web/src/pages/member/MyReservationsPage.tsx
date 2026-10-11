// Mis reservas — consultar y cancelar reservas propias (US-033, criterios 13
// y 14).
//
// Consume `GET /reservations?scope=me`, `GET /reservations/{id}` y
// `POST /reservations/{id}/cancel` (docs/api/contratos-api.md §7). La interfaz
// anticipa la regla de 24 horas (RN-RES-10) pero gana el servidor.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  buttonVariants,
} from '@activa-club/ui';
import type { Reservation, ReservationStatus } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';
import { useResourcesQuery } from '../../resources/resources-query';
import { MyReservationCard } from '../../reservations/MyReservationCard';
import {
  toCancelErrorFeedback,
  toLoadErrorMessage,
  type CancelErrorFeedback,
} from '../../reservations/my-reservations-errors';
import {
  MY_RESERVATIONS_QUERY_KEY,
  useCancelReservationMutation,
  useMyReservationsQuery,
} from '../../reservations/my-reservations-query';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';

const NOW_REFRESH_MS = 60_000;

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

interface CancelledNotice {
  title: string;
}

export function MyReservationsPage() {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const now = useNow();
  const resourcesQuery = useResourcesQuery();
  const cancelMutation = useCancelReservationMutation();

  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('');
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelError, setCancelError] = useState<CancelErrorFeedback | null>(null);
  const [notice, setNotice] = useState<CancelledNotice | null>(null);
  // Guarda síncrona contra doble clic en "Sí, cancelar".
  const inFlightRef = useRef(false);

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

  // Criterio 2: próximas vs. pasadas comparando `startsAt` con la hora actual.
  // El servidor entrega orden ascendente; las próximas conservan ese orden y
  // las pasadas se muestran de la más reciente a la más antigua.
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

  function resourceNameOf(reservation: Reservation): string | null {
    return resourceNames.get(reservation.resourceId) ?? null;
  }

  function openCancel(reservation: Reservation) {
    setCancelError(null);
    setNotice(null);
    setCancelTarget(reservation);
  }

  async function confirmCancel() {
    if (inFlightRef.current || !cancelTarget) {
      return;
    }
    inFlightRef.current = true;
    const target = cancelTarget;
    try {
      await cancelMutation.mutateAsync(target.reservationId);
      setCancelTarget(null);
      setNotice({
        title: `${resourceNameOf(target) ?? RESOURCE_TYPE_LABEL[target.resourceType]} — ${formatDateInLima(
          target.startsAt,
        )}, ${formatTimeRangeInLima(target.startsAt, target.endsAt)}`,
      });
      refreshAfterChange(target.resourceId);
    } catch (error) {
      const feedback = toCancelErrorFeedback(error);
      setCancelTarget(null);
      setCancelError(feedback);
      if (feedback.refresh) {
        refreshAfterChange(target.resourceId);
      }
      if (feedback.sessionExpired) {
        // El guard de rutas redirige a /login y devuelve al socio aquí.
        signOut();
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  function refreshAfterChange(resourceId: string) {
    void queryClient.invalidateQueries({ queryKey: MY_RESERVATIONS_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  }

  const loadError = query.isError ? toLoadErrorMessage(query.error) : null;

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

      {notice ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-xl border border-positive-200 bg-positive-50 p-4 text-sm text-positive-900"
        >
          <p className="font-semibold">Reserva cancelada</p>
          <p>{notice.title}. La franja quedó libre para otros socios.</p>
        </div>
      ) : null}

      {cancelError ? (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800"
        >
          <p className="font-semibold">{cancelError.title}</p>
          <p>{cancelError.message}</p>
        </div>
      ) : null}

      <div className="max-w-xs">
        <label htmlFor="my-reservations-status" className="text-sm font-medium text-slate-700">
          Filtrar por estado
        </label>
        <select
          id="my-reservations-status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as ReservationStatus | '')}
          className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <option value="">Todas</option>
          {RESERVATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {RESERVATION_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando tus reservas…" />
        </div>
      ) : null}

      {loadError ? (
        <ErrorState
          title="No pudimos cargar tus reservas"
          description={loadError.message}
          action={
            loadError.sessionExpired ? (
              <Button onClick={signOut}>Iniciar sesión</Button>
            ) : (
              <Button onClick={() => void query.refetch()}>Reintentar</Button>
            )
          }
        />
      ) : null}

      {query.data && reservations.length === 0 ? (
        <EmptyState
          title={statusFilter ? 'No hay reservas con ese estado' : 'Aún no tienes reservas'}
          description={
            statusFilter
              ? 'Prueba con otro estado o quita el filtro.'
              : 'Cuando reserves una instalación aparecerá aquí.'
          }
          action={
            statusFilter ? undefined : (
              <Link to="/socio/reservas" className={buttonVariants({ variant: 'primary' })}>
                Reservar una instalación
              </Link>
            )
          }
        />
      ) : null}

      {query.data && reservations.length > 0 ? (
        <>
          <ReservationGroup
            headingId="reservas-proximas-heading"
            title="Próximas"
            emptyText="No tienes reservas próximas en las páginas cargadas."
            reservations={upcoming}
            now={now}
            cancellingId={cancelMutation.isPending ? cancelTarget?.reservationId : undefined}
            resourceNameOf={resourceNameOf}
            onCancel={openCancel}
          />
          <ReservationGroup
            headingId="reservas-pasadas-heading"
            title="Pasadas"
            emptyText="No hay reservas pasadas en las páginas cargadas."
            reservations={past}
            now={now}
            cancellingId={undefined}
            resourceNameOf={resourceNameOf}
            onCancel={openCancel}
          />
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              className="self-center"
              isLoading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Cargar más
            </Button>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="¿Cancelar esta reserva?"
        description={
          cancelTarget
            ? `${resourceNameOf(cancelTarget) ?? RESOURCE_TYPE_LABEL[cancelTarget.resourceType]}, ${formatDateInLima(
                cancelTarget.startsAt,
              )}, ${formatTimeRangeInLima(cancelTarget.startsAt, cancelTarget.endsAt)}. La franja quedará libre y el cupo mensual de tus invitados se devolverá. Esta acción no se puede deshacer.`
            : undefined
        }
        confirmLabel="Sí, cancelar reserva"
        cancelLabel="Mantener reserva"
        confirmVariant="danger"
        isLoading={cancelMutation.isPending}
        onConfirm={() => void confirmCancel()}
        onCancel={() => {
          if (!cancelMutation.isPending) {
            setCancelTarget(null);
          }
        }}
      />
    </div>
  );
}

interface ReservationGroupProps {
  headingId: string;
  title: string;
  emptyText: string;
  reservations: Reservation[];
  now: Date;
  cancellingId: string | undefined;
  resourceNameOf: (reservation: Reservation) => string | null;
  onCancel: (reservation: Reservation) => void;
}

function ReservationGroup({
  headingId,
  title,
  emptyText,
  reservations,
  now,
  cancellingId,
  resourceNameOf,
  onCancel,
}: ReservationGroupProps) {
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold text-slate-900">
        {title}
      </h2>
      {reservations.length === 0 ? (
        <p className="text-sm text-slate-600">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <li key={reservation.reservationId}>
              <MyReservationCard
                reservation={reservation}
                resourceName={resourceNameOf(reservation)}
                now={now}
                isCancelling={cancellingId === reservation.reservationId}
                onCancel={onCancel}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
