// Traducción de `ReservationStatus` a texto y variante de `Badge` (US-033,
// criterio 13). Ninguna pantalla muestra el código crudo del dominio.

import type { ReservationStatus } from '@activa-club/shared-types';
import type { BadgeVariant } from '@activa-club/ui';

export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  CONFIRMED: 'Confirmada',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

export const RESERVATION_STATUS_BADGE_VARIANT: Record<ReservationStatus, BadgeVariant> = {
  CONFIRMED: 'positive',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'positive',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

export const RESERVATION_STATUSES: ReservationStatus[] = [
  'CONFIRMED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
];
