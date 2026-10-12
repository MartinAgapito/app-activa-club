// Cliente HTTP de la consola de notificaciones del administrador (US-049).
// Contrato: docs/api/contratos-api.md §8 (`POST /notifications` y
// `GET /notifications/sent`, implementados por US-048). Para elegir
// destinatarios se reutilizan `lookupMemberByDni` y `fetchResources`.

import type {
  CreateNotificationRequest,
  CreateNotificationResponse,
  Paginated,
  SentNotification,
} from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

export const SENT_NOTIFICATIONS_PAGE_SIZE = 20;

/** `POST /notifications` (admin). Responde 201 con el resumen de la publicación. */
export function publishNotification(
  request: CreateNotificationRequest,
): Promise<CreateNotificationResponse> {
  return apiRequest<CreateNotificationResponse>('/notifications', {
    method: 'POST',
    body: request,
  });
}

/** Una página del historial de lo enviado, de la más reciente a la más antigua. */
export function listSentNotifications(cursor: string | null): Promise<Paginated<SentNotification>> {
  const query = new URLSearchParams({ limit: String(SENT_NOTIFICATIONS_PAGE_SIZE) });
  if (cursor) {
    query.set('cursor', cursor);
  }
  return apiRequest<Paginated<SentNotification>>(`/notifications/sent?${query.toString()}`);
}
