// Entidades y DTOs de notificaciones (RN-NOT).
// Alineado con docs/data/diccionario-de-datos.md y docs/api/contratos-api.md §8.

import type { ISODateString } from './common';

export type NotificationSegment =
  'ALL' | 'ACTIVE' | 'DEBT' | 'EXPIRED' | 'EXPIRING_SOON' | 'SINGLE' | 'BY_RESOURCE';

export type NotificationEvent =
  | 'ACCOUNT_ACTIVATED'
  | 'MEMBER_APPROVED'
  | 'MEMBER_REJECTED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'RENEWAL_DUE'
  | 'RENEWAL_OVERDUE'
  | 'RESERVATION_CONFIRMED'
  | 'RESERVATION_CANCELLED'
  | 'RESERVATION_APPROVED'
  | 'RESERVATION_REJECTED'
  | 'RESOURCE_MAINTENANCE'
  | 'RESERVATION_REMINDER';

export type NotificationReadStatus = 'UNREAD' | 'READ';

/** Registro de notificación emitida (entidad Notification, vista admin). */
export interface Notification {
  notificationId: string;
  title: string;
  body: string;
  segment: NotificationSegment | null;
  targetMemberId: string | null;
  resourceId: string | null;
  event: NotificationEvent | null;
  alsoEmail: boolean;
  createdBy: string;
  recipientCount: number | null;
  createdAt: ISODateString;
}

/** Notificación en el inbox de un socio (entidad MemberNotification). */
export interface MemberNotification {
  notificationId: string;
  memberId: string;
  title: string;
  body: string;
  event: NotificationEvent | null;
  readStatus: NotificationReadStatus;
  createdAt: ISODateString;
  readAt: ISODateString | null;
}

export interface CreateNotificationRequest {
  segment: NotificationSegment;
  title: string;
  body: string;
  alsoEmail: boolean;
  targetMemberId?: string;
  resourceId?: string;
}

export interface CreateNotificationResponse {
  notificationId: string;
  recipientCount: number;
}
