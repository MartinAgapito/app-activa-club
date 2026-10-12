// Acceso a la sección relacionada de una notificación (US-041, criterio 9).
// Solo eventos de reserva o pago llevan enlace; nunca se muestran
// identificadores internos.

import type { NotificationEvent } from '@activa-club/shared-types';

export interface NotificationLink {
  to: string;
  label: string;
}

const RESERVATIONS: NotificationLink = { to: '/socio/reservas/mias', label: 'Ir a Mis reservas' };
const MEMBERSHIP: NotificationLink = { to: '/socio/membresia', label: 'Ir a Membresía' };

const LINK_BY_EVENT: Partial<Record<NotificationEvent, NotificationLink>> = {
  RESERVATION_CONFIRMED: RESERVATIONS,
  RESERVATION_CANCELLED: RESERVATIONS,
  RESERVATION_APPROVED: RESERVATIONS,
  RESERVATION_REJECTED: RESERVATIONS,
  RESERVATION_REMINDER: RESERVATIONS,
  RESOURCE_MAINTENANCE: RESERVATIONS,
  PAYMENT_SUCCEEDED: MEMBERSHIP,
  PAYMENT_FAILED: MEMBERSHIP,
  RENEWAL_DUE: MEMBERSHIP,
  RENEWAL_OVERDUE: MEMBERSHIP,
};

/** Enlace a la sección relacionada, o `null` si el evento no lo tiene
 * (notificaciones manuales del administrador o eventos de cuenta). */
export function linkForEvent(event: NotificationEvent | null): NotificationLink | null {
  return event ? (LINK_BY_EVENT[event] ?? null) : null;
}
