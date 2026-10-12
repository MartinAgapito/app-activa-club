// Consultas y mutación de la consola de notificaciones del administrador
// (US-049). Clave propia (`admin-notifications`) para no mezclarse con la
// bandeja del socio, cuyas actualizaciones optimistas recorren `notifications`.

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  CreateNotificationRequest,
  CreateNotificationResponse,
  Paginated,
  SentNotification,
} from '@activa-club/shared-types';
import { listSentNotifications, publishNotification } from './admin-notifications-client';

export const ADMIN_NOTIFICATIONS_QUERY_KEY = ['admin-notifications'] as const;

export function useSentNotificationsQuery(): UseInfiniteQueryResult<
  InfiniteData<Paginated<SentNotification>, string | null>
> {
  return useInfiniteQuery({
    queryKey: [...ADMIN_NOTIFICATIONS_QUERY_KEY, 'sent'],
    queryFn: ({ pageParam }) => listSentNotifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/** Publica un aviso. Al terminar bien, el historial se refresca para que el
 * aviso aparezca al inicio (criterio 6 de US-049). */
export function usePublishNotificationMutation(): UseMutationResult<
  CreateNotificationResponse,
  Error,
  CreateNotificationRequest
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateNotificationRequest) => publishNotification(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_NOTIFICATIONS_QUERY_KEY });
    },
  });
}
