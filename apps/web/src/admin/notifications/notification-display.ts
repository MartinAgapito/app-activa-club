// Textos de la consola de notificaciones del administrador (US-049): nombre y
// explicación de cada segmento (contratos-api.md §8) y evento de los avisos
// automáticos. Nunca se muestran los códigos internos al administrador.

import type {
  NotificationEvent,
  NotificationOrigin,
  NotificationSegment,
} from '@activa-club/shared-types';

/** Orden en que se ofrecen los segmentos en el selector. */
export const SEGMENT_OPTIONS: ReadonlyArray<NotificationSegment> = [
  'ALL',
  'ACTIVE',
  'DEBT',
  'EXPIRING_SOON',
  'EXPIRED',
  'SINGLE',
  'BY_RESOURCE',
];

export const SEGMENT_LABEL: Record<NotificationSegment, string> = {
  ALL: 'Todos los socios',
  ACTIVE: 'Socios activos',
  DEBT: 'Socios con deuda',
  EXPIRED: 'Socios con membresía vencida',
  EXPIRING_SOON: 'Socios con membresía por vencer',
  SINGLE: 'Un socio (por DNI)',
  BY_RESOURCE: 'Titulares de reservas de una instalación',
};

export const SEGMENT_DESCRIPTION: Record<NotificationSegment, string> = {
  ALL: 'Todos los socios que ya activaron su cuenta digital.',
  ACTIVE: 'Socios con membresía vigente (activa o por vencer) y sin deuda.',
  DEBT: 'Socios con la membresía en deuda o con saldo pendiente.',
  EXPIRED: 'Socios cuya membresía ya venció.',
  EXPIRING_SOON: 'Socios cuya membresía está por vencer.',
  SINGLE: 'Un solo socio con cuenta digital, identificado por su DNI.',
  BY_RESOURCE: 'Quienes tienen reservas activas o futuras en la instalación elegida.',
};

export const ORIGIN_LABEL: Record<NotificationOrigin, string> = {
  MANUAL: 'Manual',
  SYSTEM: 'Sistema',
};

export const EVENT_LABEL: Record<NotificationEvent, string> = {
  ACCOUNT_ACTIVATED: 'Cuenta activada',
  MEMBER_APPROVED: 'Solicitud de alta aprobada',
  MEMBER_REJECTED: 'Solicitud de alta rechazada',
  PAYMENT_SUCCEEDED: 'Pago confirmado',
  PAYMENT_FAILED: 'Pago fallido',
  RENEWAL_DUE: 'Renovación próxima',
  RENEWAL_OVERDUE: 'Renovación vencida',
  RESERVATION_CONFIRMED: 'Reserva confirmada',
  RESERVATION_CANCELLED: 'Reserva cancelada',
  RESERVATION_APPROVED: 'Reserva aprobada',
  RESERVATION_REJECTED: 'Reserva rechazada',
  RESOURCE_MAINTENANCE: 'Mantenimiento de una instalación',
  RESERVATION_REMINDER: 'Recordatorio de reserva',
};
