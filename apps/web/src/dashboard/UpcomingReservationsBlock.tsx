import { Link } from 'react-router-dom';
import { Badge, buttonVariants } from '@activa-club/ui';
import type { MemberDashboardReservation } from '@activa-club/shared-types';
import { formatDayPartsInLima, formatTimeInLima } from '../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';
import {
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../reservations/reservation-status';

/** Próximas reservas (hasta 5, ya ordenadas por el servidor). Fuente:
 * `GET /dashboard/member`. El resumen trae el tipo de instalación y el inicio
 * (no el nombre ni la hora de fin): el detalle está en "Mis reservas". */
export function UpcomingReservationsBlock({
  reservations,
  canReserve,
}: {
  reservations: MemberDashboardReservation[];
  canReserve: boolean;
}) {
  return (
    <section aria-labelledby="proximas-titulo" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="proximas-titulo" className="type-section-title text-ink">
          Próximas reservas
        </h2>
        <Link to="/socio/reservas/mias" className="type-aux font-medium text-action underline">
          Ver todas mis reservas
        </Link>
      </div>

      {reservations.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface-card p-5">
          <p className="type-body text-ink">
            {canReserve
              ? 'No tienes reservas próximas. Reserva una cancha o una instalación del club.'
              : 'No tienes reservas próximas. Regulariza tu membresía para volver a reservar.'}
          </p>
          {canReserve ? (
            <Link to="/socio/reservas" className={buttonVariants({ variant: 'primary' })}>
              Reservar una instalación
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <ReservationItem key={reservation.reservationId} reservation={reservation} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReservationItem({ reservation }: { reservation: MemberDashboardReservation }) {
  const { day, month, weekday } = formatDayPartsInLima(reservation.startsAt);
  return (
    <li>
      <Link
        to="/socio/reservas/mias"
        className="flex items-center gap-4 rounded-card border border-line bg-surface-card p-4 shadow-card transition-colors hover:bg-surface-brand-soft focus-ring"
      >
        <div className="flex w-14 shrink-0 flex-col items-center rounded-control bg-surface-brand-soft py-2 text-action">
          <span className="type-aux uppercase">{weekday}</span>
          <span className="type-figure leading-none tabular-nums">{day}</span>
          <span className="type-aux uppercase">{month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="type-card-title truncate text-ink">
            {RESOURCE_TYPE_LABEL[reservation.resourceType]}
          </p>
          <p className="type-body tabular-nums text-ink-muted">
            {formatTimeInLima(reservation.startsAt)}
          </p>
        </div>
        <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[reservation.reservationStatus]}>
          {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
        </Badge>
      </Link>
    </li>
  );
}
