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

/**
 * Elemento de la bandeja del socio devuelto por `GET /notifications` y
 * `POST /notifications/{notificationId}/read` (contratos-api.md §8): la
 * `MemberNotification` sin `memberId` (la identidad sale del token).
 */
export type InboxNotification = Omit<MemberNotification, 'memberId'>;

export interface CreateNotificationRequest {
  segment: NotificationSegment;
  title: string;
  body: string;
  alsoEmail: boolean;
  targetMemberId?: string;
  resourceId?: string;
}

/**
 * Resumen de una publicación (`POST /notifications`, contratos-api.md §8).
 * `recipientCount` es el número de bandejas en las que quedó el aviso; los
 * contadores de correo solo son distintos de cero con `alsoEmail=true`.
 */
export interface CreateNotificationResponse {
  notificationId: string;
  recipientCount: number;
  /** Correos aceptados por SES. */
  emailsSent: number;
  /** Correos intentados que SES rechazó (best-effort: no reducen `recipientCount`). */
  emailsFailed: number;
  /** Destinatarios sin correo enviado por el tope por publicación, el presupuesto de tiempo o falta de correo. */
  emailsSkipped: number;
  /** `true` si la solicitud repitió una publicación idéntica reciente (reintento idempotente). */
  replayed: boolean;
}

/** Quién originó una notificación enviada: un administrador o un proceso automático. */
export type NotificationOrigin = 'MANUAL' | 'SYSTEM';

/** Elemento de `GET /notifications/sent`: la `Notification` más su origen. */
export interface SentNotification extends Notification {
  origin: NotificationOrigin;
}
