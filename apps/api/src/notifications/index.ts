// API pública del módulo de notificaciones (US-040). Los consumidores
// (US-042..US-047) importan solo desde aquí.

export {
  emitNotification,
  isNotificationEvent,
  NOTIFICATION_METRICS,
  type EmailResult,
  type EmitNotificationDeps,
  type EmitNotificationInput,
  type EmitNotificationResult,
  type InboxResult,
  type NotificationRecipient,
} from './emit';
export {
  NOTIFICATION_EVENTS,
  UnknownNotificationEventError,
  renderNotification,
  type NotificationData,
  type NotificationDataByEvent,
  type RenderedNotification,
} from './templates';
export { safeEmitNotification, type NotificationEmitter, type SafeEmitDeps } from './safe-emit';
export { buildDedupeKey, notificationIdFromDedupeKey } from './dedupe';
