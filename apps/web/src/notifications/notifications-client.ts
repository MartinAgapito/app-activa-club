// Cliente HTTP de la bandeja del socio (docs/api/contratos-api.md §8, US-041).
// La identidad sale del JWT: el cliente nunca envía un identificador de socio.

import type { InboxNotification, Paginated } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Una página de la bandeja propia, de la más reciente a la más antigua.
 * `unreadOnly` pide solo las no leídas (`unread=true`). */
export function listMyNotifications(
  cursor: string | null,
  unreadOnly: boolean,
): Promise<Paginated<InboxNotification>> {
  const query = new URLSearchParams({ limit: String(NOTIFICATIONS_PAGE_SIZE) });
  if (unreadOnly) {
    query.set('unread', 'true');
  }
  if (cursor) {
    query.set('cursor', cursor);
  }
  return apiRequest<Paginated<InboxNotification>>(`/notifications?${query.toString()}`);
}

/** Marca una notificación propia como leída (idempotente en el servidor). */
export function markNotificationRead(notificationId: string): Promise<InboxNotification> {
  return apiRequest<InboxNotification>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: 'POST' },
  );
}
