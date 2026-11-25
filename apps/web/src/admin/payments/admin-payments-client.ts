// Cliente de la consulta administrativa de pagos — US-053.
//
// `GET /payments?memberId=&status=&from=&to=&cursor=&limit=` y
// `GET /payments/{paymentId}` (admin, docs/api/contratos-api.md §5, US-025).
// El servidor exige al menos `memberId` o `status` (400 sin ninguno): la
// pantalla nunca consulta sin uno de los dos. `from` (inclusivo) y `to`
// (exclusivo) acotan por `createdAt` (US-081). Para admin, cada pago trae
// `member` (nombre) o null. La respuesta es el
// `PaymentSummary` público: sin datos de tarjeta, sin `failureReason`.

import type { Paginated, PaymentStatus, PaymentSummary } from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';
import { addDaysToDate, limaLocalTimeToUtcIso } from '../../lib/format/lima-time';

export const ADMIN_PAYMENTS_PAGE_SIZE = 20;

export interface AdminPaymentFilters {
  memberId?: string | undefined;
  status?: PaymentStatus | undefined;
  /** Instante UTC ISO inclusivo (`createdAt >= from`). */
  from?: string | undefined;
  /** Instante UTC ISO exclusivo (`createdAt < to`). */
  to?: string | undefined;
}

/** Inicio de un día `YYYY-MM-DD` de Lima, como instante UTC ISO. */
export function paymentRangeFrom(date: string): string {
  return limaLocalTimeToUtcIso(date, '00:00');
}

/** Límite exclusivo que incluye todo el día `YYYY-MM-DD` de Lima: el inicio
 * del día siguiente. */
export function paymentRangeTo(date: string): string {
  return limaLocalTimeToUtcIso(addDaysToDate(date, 1), '00:00');
}

export function listAdminPayments(
  filters: AdminPaymentFilters & { cursor?: string | null },
): Promise<Paginated<PaymentSummary>> {
  const params = new URLSearchParams({ limit: String(ADMIN_PAYMENTS_PAGE_SIZE) });
  if (filters.memberId) params.set('memberId', filters.memberId);
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  return apiRequest<Paginated<PaymentSummary>>(`/payments?${params.toString()}`);
}

export function fetchAdminPaymentDetail(paymentId: string): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(`/payments/${encodeURIComponent(paymentId)}`);
}
