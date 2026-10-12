// Emisión de una notificación de evento automático a un socio (US-040).
//
// Una sola capacidad reutilizable ("el cómo"); US-042..US-047 deciden "cuándo"
// y "a quién". Reglas:
//   - La bandeja interna es obligatoria (RN-NOT-01): `Notification`
//     (createdBy=SYSTEM, segment=SINGLE) y `MemberNotification` se escriben en
//     una única `TransactWriteItems` para que nunca quede una sin la otra.
//   - Idempotente (criterio 8): las claves derivan de `evento + socio + hecho`
//     (ver `dedupe.ts`); un reintento falla la condición `attribute_not_exists`
//     y devuelve `DUPLICATE` sin escribir ni enviar correo otra vez.
//   - El correo es best-effort (RN-NOT-02, criterio 5): un fallo de SES jamás
//     revierte la bandeja ni se propaga al llamante.
//   - Un fallo de la bandeja no revierte la operación de negocio ya confirmada
//     (criterio 7): se registra con `metric` estable para la alarma (ADR-0008).
//   - Esta función no lanza por fallos de infraestructura; solo por errores de
//     programación (evento fuera del catálogo, `entityId` vacío, datos mal
//     formados).
//
// Privacidad (criterio 6): los logs llevan evento, memberId y el nombre del
// error; nunca el contenido del mensaje ni el correo del destinatario.

import {
  GetCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { NotificationEvent } from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { logger as defaultLogger } from '../lib/logger';
import { buildDedupeKey, notificationIdFromDedupeKey } from './dedupe';
import { createSesEmailSender, getSenderEmail, type EmailSender } from './mailer';
import {
  NOTIFICATION_EVENTS,
  UnknownNotificationEventError,
  renderNotification,
  type NotificationData,
} from './templates';

/** Métricas/claves estables para filtros de métrica y alarmas de CloudWatch. */
export const NOTIFICATION_METRICS = {
  INBOX_WRITE_FAILED: 'NOTIFICATION_INBOX_WRITE_FAILED',
  EMAIL_SEND_FAILED: 'NOTIFICATION_EMAIL_SEND_FAILED',
} as const;

/** Destinatario ya resuelto por el llamante (evita una lectura extra). */
export interface NotificationRecipient {
  memberId: string;
  /** Correo del socio; si falta, el correo se omite (`SKIPPED`). */
  email?: string | null;
  /** Solo el nombre de pila: nunca apellidos ni DNI. */
  firstName: string;
}

interface EmitBase<E extends NotificationEvent> {
  event: E;
  data: NotificationData<E>;
  /**
   * Identificador del hecho que origina el aviso (paymentId, reservationId,
   * identificador del ciclo de membresía, ...). Junto con evento y socio forma
   * la clave de idempotencia.
   */
  entityId: string;
  /** Instante de referencia ISO (pruebas deterministas); por defecto, ahora. */
  now?: string;
  /** Correlación con la solicitud que originó el aviso (ADR-0008). */
  requestId?: string;
}

export type EmitNotificationInput<E extends NotificationEvent> = EmitBase<E> &
  ({ member: NotificationRecipient; memberId?: never } | { memberId: string; member?: never });

export type InboxResult = 'WRITTEN' | 'DUPLICATE' | 'FAILED';
export type EmailResult = 'SENT' | 'SKIPPED' | 'FAILED';

export interface EmitNotificationResult {
  inbox: InboxResult;
  email: EmailResult;
  /** Identificador determinista de la notificación (el mismo en cada reintento). */
  notificationId: string;
}

/** Dependencias inyectables (pruebas); por defecto, clientes reales. */
export interface EmitNotificationDeps {
  client?: DynamoDBDocumentClient;
  emailSender?: EmailSender | null;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set(NOTIFICATION_EVENTS);

/** Indica si un valor pertenece al catálogo de 13 eventos. */
export function isNotificationEvent(value: unknown): value is NotificationEvent {
  return typeof value === 'string' && KNOWN_EVENTS.has(value);
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

function isDuplicateWrite(error: unknown): boolean {
  if (errorName(error) !== 'TransactionCanceledException') return false;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return Array.isArray(reasons) && reasons.some((r) => r.Code === 'ConditionalCheckFailed');
}

async function resolveRecipient(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<NotificationRecipient | null> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName(),
      Key: keys.member(memberId),
      ProjectionExpression: 'memberId, email, firstName',
    }),
  );
  const item = result.Item as
    { memberId?: string; email?: string | null; firstName?: string } | undefined;
  if (!item || typeof item.firstName !== 'string') return null;
  return { memberId, email: item.email ?? null, firstName: item.firstName };
}

/**
 * Emite `event` al socio indicado. Ver cabecera del módulo para las garantías.
 *
 * @throws UnknownNotificationEventError evento fuera del catálogo.
 * @throws TypeError `entityId`/`memberId` vacíos.
 */
export async function emitNotification<E extends NotificationEvent>(
  input: EmitNotificationInput<E>,
  deps: EmitNotificationDeps = {},
): Promise<EmitNotificationResult> {
  if (!isNotificationEvent(input.event)) {
    throw new UnknownNotificationEventError(input.event);
  }
  const memberId = input.member?.memberId ?? input.memberId;
  if (!memberId) throw new TypeError('emitNotification: memberId es obligatorio');
  if (!input.entityId) throw new TypeError('emitNotification: entityId es obligatorio');

  const log = deps.logger ?? defaultLogger;
  const requestId = input.requestId ?? 'notification-emit';
  const baseLog = { requestId, entityType: 'Notification', event: input.event, memberId };

  const dedupeKey = buildDedupeKey(input.event, memberId, input.entityId);
  const notificationId = notificationIdFromDedupeKey(dedupeKey);
  const createdAt = input.now ?? new Date().toISOString();

  // 1. Destinatario.
  let recipient: NotificationRecipient | null = input.member ?? null;
  let client: DynamoDBDocumentClient;
  try {
    client = deps.client ?? getDocumentClient();
    recipient ??= await resolveRecipient(client, memberId);
  } catch (error) {
    return failInbox(log, baseLog, notificationId, 'RECIPIENT_LOOKUP_ERROR', error);
  }
  if (!recipient) {
    return failInbox(log, baseLog, notificationId, 'RECIPIENT_NOT_FOUND');
  }

  // 2. Texto (error de programación si los datos no corresponden al evento).
  const rendered = renderNotification(input.event, input.data, recipient.firstName);

  // 3. Bandeja interna (obligatoria).
  const emailTo = recipient.email ? recipient.email : null;
  const sender = deps.emailSender === undefined ? resolveSender() : deps.emailSender;
  const emailAttempted = emailTo !== null && sender !== null;

  let inbox: InboxResult;
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tableName(),
              Item: {
                ...keys.notification(notificationId),
                ...keys.notificationSent(createdAt, notificationId),
                entityType: 'Notification',
                notificationId,
                title: rendered.title,
                body: rendered.body,
                segment: 'SINGLE',
                targetMemberId: memberId,
                resourceId: null,
                event: input.event,
                alsoEmail: emailAttempted,
                createdBy: 'SYSTEM',
                recipientCount: 1,
                dedupeKey,
                createdAt,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: tableName(),
              Item: {
                ...keys.memberNotification(memberId, createdAt, notificationId),
                entityType: 'MemberNotification',
                notificationId,
                memberId,
                title: rendered.title,
                body: rendered.body,
                event: input.event,
                readStatus: 'UNREAD',
                createdAt,
                readAt: null,
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
    inbox = 'WRITTEN';
  } catch (error) {
    if (isDuplicateWrite(error)) {
      log.info('Notificación duplicada ignorada', {
        ...baseLog,
        action: 'NOTIFICATION_EMIT',
        outcome: 'SUCCESS',
        inbox: 'DUPLICATE',
      });
      return { inbox: 'DUPLICATE', email: 'SKIPPED', notificationId };
    }
    inbox = 'FAILED';
    log.error('No se pudo escribir la notificación en la bandeja', {
      ...baseLog,
      action: 'NOTIFICATION_EMIT',
      outcome: 'FAILURE',
      metric: NOTIFICATION_METRICS.INBOX_WRITE_FAILED,
      reason: errorName(error),
    });
  }

  // 4. Correo (best-effort). Se intenta aun si la bandeja falló: el aviso al
  // socio es más valioso que evitar un posible correo repetido si alguien
  // reintenta manualmente.
  let email: EmailResult = 'SKIPPED';
  if (emailAttempted && emailTo !== null && sender !== null) {
    try {
      await sender.send({
        to: emailTo,
        subject: rendered.emailSubject,
        text: rendered.emailText,
        html: rendered.emailHtml,
      });
      email = 'SENT';
    } catch (error) {
      email = 'FAILED';
      log.warn('No se pudo enviar el correo de la notificación', {
        ...baseLog,
        action: 'NOTIFICATION_EMAIL',
        outcome: 'FAILURE',
        metric: NOTIFICATION_METRICS.EMAIL_SEND_FAILED,
        reason: errorName(error),
      });
    }
  } else {
    log.warn('Correo de la notificación omitido', {
      ...baseLog,
      action: 'NOTIFICATION_EMAIL',
      outcome: 'FAILURE',
      reason: emailTo === null ? 'NO_RECIPIENT_EMAIL' : 'SENDER_NOT_CONFIGURED',
    });
  }

  if (inbox === 'WRITTEN') {
    log.info('Notificación emitida', {
      ...baseLog,
      action: 'NOTIFICATION_EMIT',
      outcome: 'SUCCESS',
      inbox,
      email,
    });
  }
  return { inbox, email, notificationId };
}

function resolveSender(): EmailSender | null {
  const sender = getSenderEmail();
  return sender ? createSesEmailSender(sender) : null;
}

function failInbox(
  log: NonNullable<EmitNotificationDeps['logger']>,
  baseLog: Record<string, unknown> & { requestId: string },
  notificationId: string,
  reason: string,
  error?: unknown,
): EmitNotificationResult {
  log.error('No se pudo emitir la notificación', {
    ...baseLog,
    action: 'NOTIFICATION_EMIT',
    outcome: 'FAILURE',
    metric: NOTIFICATION_METRICS.INBOX_WRITE_FAILED,
    reason: error === undefined ? reason : `${reason}:${errorName(error)}`,
  });
  return { inbox: 'FAILED', email: 'SKIPPED', notificationId };
}
