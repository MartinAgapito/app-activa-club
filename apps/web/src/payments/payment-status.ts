// Etiquetas y variante visual de cada `paymentStatus` (US-050, criterio 2).
// Nunca se muestra el código crudo; el estado siempre lleva texto además del
// color.

import type { PaymentStatus, PaymentSummary } from '@activa-club/shared-types';
import type { BadgeVariant } from '@activa-club/ui';
import { MEMBERSHIP_TYPE_LABEL } from '../lib/format/membership-plan';

/** Estados en el orden en que los muestran los filtros del administrador (US-053). */
export const PAYMENT_STATUSES: ReadonlyArray<PaymentStatus> = [
  'FAILED',
  'PENDING_CONFIRMATION',
  'SUCCEEDED',
];

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  SUCCEEDED: 'Pagado',
  PENDING_CONFIRMATION: 'En verificación',
  FAILED: 'Rechazado',
};

export const PAYMENT_STATUS_BADGE_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  SUCCEEDED: 'positive',
  PENDING_CONFIRMATION: 'warning',
  FAILED: 'danger',
};

/** Concepto del cobro, p. ej. "Membresía anual". */
export function planLabel(payment: PaymentSummary): string {
  return `Membresía ${MEMBERSHIP_TYPE_LABEL[payment.membershipType].toLowerCase()}`;
}
