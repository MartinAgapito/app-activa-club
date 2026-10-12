import { Link } from 'react-router-dom';
import { Badge, buttonVariants } from '@activa-club/ui';
import type { Reservation } from '@activa-club/shared-types';
import { formatDayPartsInLima, formatTimeRangeInLima } from '../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';
import {
  RESERVATION_STATUS_BADGE_VARIANT,
  RESERVATION_STATUS_LABEL,
} from '../reservations/reservation-status';
import { useResourcesQuery } from '../resources/resources-query';
import { BlockError, BlockLoading } from './BlockState';
import { useUpcomingReservationsQuery } from './upcoming-reservations';

/** Próximas reservas (máx. 3). Fuente: `GET /reservations?scope=me&from=`. */
export function UpcomingReservationsBlock() {
  const query = useUpcomingReservationsQuery();
  const resourcesQuery = useResourcesQuery();
  const names = new Map((resourcesQuery.data ?? []).map((r) => [r.resourceId, r.name] as const));

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

      {query.isPending ? <BlockLoading label="Cargando tus próximas reservas…" /> : null}

      {query.isError ? (
        <BlockError
          title="No pudimos cargar tus próximas reservas"
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data && query.data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface-card p-5">
          <p className="type-body text-ink">
            No tienes reservas próximas. Reserva una cancha o una instalación del club.
          </p>
          <Link to="/socio/reservas" className={buttonVariants({ variant: 'primary' })}>
            Reservar una instalación
          </Link>
        </div>
      ) : null}

      {query.data && query.data.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {query.data.map((reservation) => (
            <ReservationItem
              key={reservation.reservationId}
              reservation={reservation}
              name={
                names.get(reservation.resourceId) ?? RESOURCE_TYPE_LABEL[reservation.resourceType]
              }
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ReservationItem({ reservation, name }: { reservation: Reservation; name: string }) {
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
          <p className="type-card-title truncate text-ink">{name}</p>
          <p className="type-body tabular-nums text-ink-muted">
            {formatTimeRangeInLima(reservation.startsAt, reservation.endsAt)}
          </p>
        </div>
        <Badge variant={RESERVATION_STATUS_BADGE_VARIANT[reservation.reservationStatus]}>
          {RESERVATION_STATUS_LABEL[reservation.reservationStatus]}
        </Badge>
      </Link>
    </li>
  );
}
