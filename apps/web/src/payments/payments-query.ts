import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PaymentSummary } from '@activa-club/shared-types';
import { fetchLatestPayment } from './payments-list-client';

export const LATEST_PAYMENT_QUERY_KEY = ['payments', 'latest'] as const;

export function useLatestPaymentQuery(): UseQueryResult<PaymentSummary | null> {
  return useQuery({ queryKey: LATEST_PAYMENT_QUERY_KEY, queryFn: fetchLatestPayment });
}
