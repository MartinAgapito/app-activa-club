// Cliente de la consulta administrativa de pagos — US-053.
//
// `GET /payments?memberId=&status=&cursor=&limit=` y
// `GET /payments/{paymentId}` (admin, docs/api/contratos-api.md §5, US-025).
// El servidor exige al menos `memberId` o `status` (400 sin ninguno): la
// pantalla nunca consulta sin uno de los dos. La respuesta es el
// `PaymentSummary` público: sin datos de tarjeta, sin `failureReason`.

import type { Paginated, PaymentStatus, PaymentSummary } from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';

export const ADMIN_PAYMENTS_PAGE_SIZE = 20;

export interface AdminPaymentFilters {
  memberId?: string | undefined;
  status?: PaymentStatus | undefined;
}

export function listAdminPayments(
  filters: AdminPaymentFilters & { cursor?: string | null },
): Promise<Paginated<PaymentSummary>> {
  const params = new URLSearchParams({ limit: String(ADMIN_PAYMENTS_PAGE_SIZE) });
  if (filters.memberId) params.set('memberId', filters.memberId);
  if (filters.status) params.set('status', filters.status);
  if (filters.cursor) params.set('cursor', filters.cursor);
  return apiRequest<Paginated<PaymentSummary>>(`/payments?${params.toString()}`);
}

export function fetchAdminPaymentDetail(paymentId: string): Promise<PaymentSummary> {
  return apiRequest<PaymentSummary>(`/payments/${encodeURIComponent(paymentId)}`);
}
