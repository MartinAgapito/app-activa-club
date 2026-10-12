// Consultas y mutación de la bandeja del socio (US-041).
//
// "Marcar como leída" es optimista: la lista (todas las pestañas en caché) se
// actualiza al instante y, si el servidor falla, se restaura el estado previo.

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { InboxNotification, Paginated } from '@activa-club/shared-types';
import { listMyNotifications, markNotificationRead } from './notifications-client';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

type NotificationsData = InfiniteData<Paginated<InboxNotification>, string | null>;

export function useNotificationsQuery(
  unreadOnly: boolean,
): UseInfiniteQueryResult<NotificationsData> {
  return useInfiniteQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'list', unreadOnly ? 'unread' : 'all'],
    queryFn: ({ pageParam }) => listMyNotifications(pageParam, unreadOnly),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

function withRead(data: NotificationsData, notificationId: string, readAt: string) {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.notificationId === notificationId
          ? { ...item, readStatus: 'READ' as const, readAt: item.readAt ?? readAt }
          : item,
      ),
    })),
  };
}

interface MarkReadContext {
  previous: [readonly unknown[], NotificationsData | undefined][];
}

export function useMarkNotificationReadMutation(): UseMutationResult<
  InboxNotification,
  Error,
  string,
  MarkReadContext
> {
  const queryClient = useQueryClient();
  return useMutation<InboxNotification, Error, string, MarkReadContext>({
    mutationFn: (notificationId) => markNotificationRead(notificationId),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const previous = queryClient.getQueriesData<NotificationsData>({
        queryKey: NOTIFICATIONS_QUERY_KEY,
      });
      const readAt = new Date().toISOString();
      queryClient.setQueriesData<NotificationsData>(
        { queryKey: NOTIFICATIONS_QUERY_KEY },
        (data) => (data ? withRead(data, notificationId, readAt) : data),
      );
      return { previous };
    },
    onError: (_error, _notificationId, context) => {
      context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSuccess: () => {
      // Las demás pestañas se refrescan al volver a ellas; sin refetch
      // inmediato para que la notificación abierta no desaparezca de la lista.
      void queryClient.invalidateQueries({
        queryKey: NOTIFICATIONS_QUERY_KEY,
        refetchType: 'none',
      });
    },
  });
}
