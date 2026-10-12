// Queries de la consulta administrativa de pagos (US-053).

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Paginated, PaymentSummary } from '@activa-club/shared-types';
import {
  fetchAdminPaymentDetail,
  listAdminPayments,
  type AdminPaymentFilters,
} from './admin-payments-client';

export const ADMIN_PAYMENTS_QUERY_KEY = ['admin-payments'] as const;

export function useAdminPaymentsQuery(
  filters: AdminPaymentFilters,
  enabled = true,
): UseInfiniteQueryResult<InfiniteData<Paginated<PaymentSummary>, string | null>> {
  return useInfiniteQuery({
    queryKey: [
      ...ADMIN_PAYMENTS_QUERY_KEY,
      'list',
      { memberId: filters.memberId ?? null, status: filters.status ?? null },
    ],
    queryFn: ({ pageParam }) => listAdminPayments({ ...filters, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
}

export function useAdminPaymentDetailQuery(
  paymentId: string | null,
): UseQueryResult<PaymentSummary> {
  return useQuery({
    queryKey: [...ADMIN_PAYMENTS_QUERY_KEY, 'detail', paymentId],
    queryFn: () => fetchAdminPaymentDetail(paymentId as string),
    enabled: paymentId !== null,
  });
}
