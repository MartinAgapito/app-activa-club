// Helpers de presentación de reservas para las vistas administrativas.

import type { AdminReservationListItem } from '@activa-club/shared-types';
import { formatDateInLima, formatTimeRangeInLima } from '../../lib/format/lima-time';
import { RESOURCE_TYPE_LABEL } from '../../lib/format/resource';

/** Una solicitud pendiente cuyo inicio ya pasó queda "vencida sin decisión"
 * (US-034, casos alternativos): el MVP no la resuelve sola. */
export function isOverduePending(
  reservation: Pick<AdminReservationListItem, 'reservationStatus' | 'startsAt'>,
  now: Date,
): boolean {
  return (
    reservation.reservationStatus === 'PENDING_APPROVAL' &&
    new Date(reservation.startsAt).getTime() < now.getTime()
  );
}

export function holderName(reservation: Pick<AdminReservationListItem, 'holder'>): string {
  return reservation.holder
    ? `${reservation.holder.firstName} ${reservation.holder.lastName}`
    : 'Titular no disponible';
}

/** "4 personas, 2 invitados externos". */
export function participantsSummary(
  reservation: Pick<AdminReservationListItem, 'participantCount' | 'guestCount'>,
): string {
  const people = `${reservation.participantCount} ${
    reservation.participantCount === 1 ? 'persona' : 'personas'
  }`;
  const guests = reservation.guestCount;
  return guests > 0
    ? `${people}, ${guests} ${guests === 1 ? 'invitado externo' : 'invitados externos'}`
    : people;
}

/** Descripción corta para diálogos y avisos: instalación, fecha, hora, titular. */
export function describeReservation(
  reservation: Pick<
    AdminReservationListItem,
    'resourceId' | 'resourceType' | 'startsAt' | 'endsAt' | 'holder'
  >,
  resourceNames: ReadonlyMap<string, string>,
): string {
  const name =
    resourceNames.get(reservation.resourceId) ?? RESOURCE_TYPE_LABEL[reservation.resourceType];
  return `${name}, ${formatDateInLima(reservation.startsAt)}, ${formatTimeRangeInLima(
    reservation.startsAt,
    reservation.endsAt,
  )}, titular ${holderName(reservation)}`;
}

/** Antigüedad de la solicitud: "hace 5 min", "hace 3 h", "hace 2 días". */
export function formatRequestAge(createdAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) {
    return 'hace instantes';
  }
  if (minutes < 60) {
    return `hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `hace ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
