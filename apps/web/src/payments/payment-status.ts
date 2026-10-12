// Traducción de `PaymentStatus` (docs/api/contratos-api.md §5) a texto en
// español y variante visual de `Badge`. Ninguna pantalla debe mostrar el
// código crudo del dominio.

import type { PaymentStatus } from '@activa-club/shared-types';
import type { BadgeVariant } from '@activa-club/ui';

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
