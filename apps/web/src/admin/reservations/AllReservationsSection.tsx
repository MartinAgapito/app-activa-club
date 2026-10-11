// Consulta administrativa de todas las reservas y cancelación — US-036
// (criterios 8, 10 y 12).
//
// `GET /reservations?scope=all` con filtros combinables por estado,
// instalación y rango de fechas (en hora de Lima), paginación por cursor.
// El servidor exige al menos `status` o `resourceId`: la pantalla lo impone
// y no consulta mientras falten ambos. La cancelación administrativa no tiene
// ventana de 24 h; el servidor decide si procede (409 si ya estaba cerrada).

import { useId, useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
} from '@activa-club/ui';
import type { AdminReservationListItem, ReservationStatus } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import {
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABEL,
} from '../../reservations/reservation-status';
import { AdminReservationCard } from './AdminReservationCard';
import { describeReservation } from './reservation-display';
import {
  endOfDayInLimaUtcIso,
  startOfDayInLimaUtcIso,
  type AdminReservationFilters,
} from './admin-reservations-client';
import { toAdminActionFeedback, toAdminLoadError } from './admin-reservations-errors';
import {
  useAdminCancelReservationMutation,
  useAdminReservationsQuery,
  useRefreshAfterReservationChange,
} from './admin-reservations-query';
import { ReservationNotice, type ReservationNoticeData } from './ReservationNotice';

/** Estados en los que la cancelación administrativa tiene sentido. */
const CANCELLABLE_STATUSES: ReadonlySet<ReservationStatus> = new Set([
  'CONFIRMED',
  'APPROVED',
  'PENDING_APPROVAL',
]);

const SELECT_CLASS =
  'mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

interface AllReservationsSectionProps {
  now: Date;
  resourceNames: ReadonlyMap<string, string>;
}

const describe = describeReservation;

export function AllReservationsSection({ now, resourceNames }: AllReservationsSectionProps) {
  const { signOut } = useAuth();
  const refreshAfterChange = useRefreshAfterReservationChange();
  const cancelMutation = useAdminCancelReservationMutation();
  const ids = useId();

  const [status, setStatus] = useState<ReservationStatus | ''>('CONFIRMED');
  const [resourceId, setResourceId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cancelTarget, setCancelTarget] = useState<AdminReservationListItem | null>(null);
  const [notice, setNotice] = useState<ReservationNoticeData | null>(null);
  const inFlightRef = useRef(false);

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

  function clearFilters() {
    setStatus('CONFIRMED');
    setResourceId('');
    setFromDate('');
    setToDate('');
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
        type: 'success',
        title: 'Reserva cancelada',
        message: `${describe(target, resourceNames)}. La franja quedó libre y se devolvió el cupo de invitados.`,
      });
      refreshAfterChange(target.resourceId);
    } catch (error) {
      const feedback = toAdminActionFeedback(error, 'cancel');
      setCancelTarget(null);
      setNotice({ type: 'error', title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        refreshAfterChange(target.resourceId);
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    } finally {
      inFlightRef.current = false;
    }
  }

  const hasActiveFilters =
    status !== 'CONFIRMED' || resourceId !== '' || fromDate !== '' || toDate !== '';

  return (
    <section aria-labelledby="all-reservations-heading" className="flex flex-col gap-4">
      <h2 id="all-reservations-heading" className="text-lg font-semibold text-slate-900">
        Todas las reservas
      </h2>
      <p className="text-sm text-slate-600">
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
            <label htmlFor={`${ids}-status`} className="text-sm font-medium text-slate-700">
              Estado
            </label>
            <select
              id={`${ids}-status`}
              value={status}
              onChange={(event) => setStatus(event.target.value as ReservationStatus | '')}
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
            <label htmlFor={`${ids}-resource`} className="text-sm font-medium text-slate-700">
              Instalación
            </label>
            <select
              id={`${ids}-resource`}
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
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
            onChange={(event) => setFromDate(event.target.value)}
          />
          <Input
            type="date"
            label="Hasta"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
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

      {notice ? <ReservationNotice notice={notice} /> : null}

      {!hasRequiredFilter ? (
        <Card>
          <EmptyState
            title="Elige un estado o una instalación"
            description="Para consultar reservas necesitas filtrar al menos por estado o por instalación."
          />
        </Card>
      ) : null}

      {queryEnabled && query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando reservas…" />
        </div>
      ) : null}

      {loadError ? (
        <Card>
          <ErrorState
            title="No pudimos cargar las reservas"
            description={loadError.message}
            action={
              loadError.sessionExpired ? (
                <Button onClick={signOut}>Iniciar sesión</Button>
              ) : (
                <Button onClick={() => void query.refetch()}>Reintentar</Button>
              )
            }
          />
        </Card>
      ) : null}

      {queryEnabled && query.data && reservations.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay reservas con esos filtros"
            description="Prueba con otro estado, otra instalación u otro rango de fechas."
          />
        </Card>
      ) : null}

      {queryEnabled && reservations.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <li key={reservation.reservationId}>
              <AdminReservationCard
                reservation={reservation}
                resourceName={resourceNames.get(reservation.resourceId) ?? null}
                now={now}
                actions={
                  CANCELLABLE_STATUSES.has(reservation.reservationStatus) ? (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setNotice(null);
                        setCancelTarget(reservation);
                      }}
                    >
                      Cancelar reserva
                    </Button>
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      {queryEnabled && query.hasNextPage ? (
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

      <ConfirmDialog
        open={cancelTarget !== null}
        title="¿Cancelar esta reserva?"
        description={
          cancelTarget ? (
            <>
              {describe(cancelTarget, resourceNames)}. La cancelación administrativa no tiene
              ventana de 24 horas: la franja quedará libre y el cupo mensual de los invitados se
              devolverá. Esta acción no se puede deshacer.
              {cancelTarget.reservationStatus === 'PENDING_APPROVAL' ? (
                <>
                  {' '}
                  <strong>
                    Esta solicitud está pendiente: si quieres dejar constancia del motivo, lo
                    correcto es rechazarla desde la bandeja de pendientes.
                  </strong>
                </>
              ) : null}
            </>
          ) : undefined
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
    </section>
  );
}
