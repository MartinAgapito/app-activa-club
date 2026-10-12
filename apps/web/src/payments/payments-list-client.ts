// Último pago propio (`GET /payments?limit=1`, docs/api/contratos-api.md §5,
// US-025). El socio siempre recibe su propio historial, más reciente primero.
// Se usa en el inicio (US-070) solo para informar un pago en verificación.

import type { Paginated, PaymentSummary } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export async function fetchLatestPayment(): Promise<PaymentSummary | null> {
  const page = await apiRequest<Paginated<PaymentSummary>>('/payments?limit=1');
  return page.items[0] ?? null;
}

export const PAYMENTS_PAGE_SIZE = 20;

/** Una página del historial propio (`GET /payments?limit=&cursor=`, US-025).
 * El servidor ordena del más reciente al más antiguo; `memberId` no se envía
 * (lo resuelve el backend desde el JWT). */
export function listMyPayments(cursor: string | null): Promise<Paginated<PaymentSummary>> {
  const query = new URLSearchParams({ limit: String(PAYMENTS_PAGE_SIZE) });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return apiRequest<Paginated<PaymentSummary>>(`/payments?${query.toString()}`);
}
