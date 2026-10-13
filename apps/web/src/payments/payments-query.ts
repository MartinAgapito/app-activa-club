import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Paginated, PaymentSummary } from '@activa-club/shared-types';
import { fetchRecentPayments, listMyPayments } from './payments-list-client';

export const RECENT_PAYMENTS_QUERY_KEY = ['payments', 'recent'] as const;
export const PAYMENTS_LIST_QUERY_KEY = ['payments', 'list'] as const;

export function useRecentPaymentsQuery(): UseQueryResult<PaymentSummary[]> {
  return useQuery({ queryKey: RECENT_PAYMENTS_QUERY_KEY, queryFn: fetchRecentPayments });
}

/** Historial propio paginado por cursor (`nextCursor`), US-050. */
export function useMyPaymentsQuery(): UseInfiniteQueryResult<
  InfiniteData<Paginated<PaymentSummary>, string | null>
> {
  return useInfiniteQuery({
    queryKey: PAYMENTS_LIST_QUERY_KEY,
    queryFn: ({ pageParam }) => listMyPayments(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
