// Orquestador de `POST /notifications` (US-048, RN-ADM-06, RN-NOT-02/03,
// docs/api/contratos-api.md §8).
//
// Flujo:
//   1. Resuelve los destinatarios del segmento (`./segments.ts`, sin Scan).
//      Segmento sin destinatarios -> 422 `NO_RECIPIENTS`, sin escribir nada.
//   2. Deriva un `notificationId` determinista (ver `publicationId`): un
//      reintento o doble clic idéntico dentro de `IDEMPOTENCY_WINDOW_MS`
//      produce el mismo id, no duplica la bandeja ni reenvía correos.
//   3. Auditoría `NOTIFICATION_SENT` (antes de publicar: si no se puede
//      auditar, no se publica).
//   4. Bandeja: `Notification` + una `MemberNotification` por destinatario en
//      bloques `TransactWriteItems` de hasta 100 ítems (cada bloque es
//      atómico; la `Notification` va en el primero con
//      `attribute_not_exists(PK)`). `TransactWriteItems` solo exige el permiso
//      `dynamodb:PutItem` de cada operación (no existe una acción IAM propia).
//   5. Correo opcional (`alsoEmail`), best-effort y acotado (`./publish-email.ts`).
//
// Reintento tras fallo parcial: si un bloque posterior al primero falla, se
// deja la `Notification` con el conteo realmente escrito y se responde 500;
// el reintento idéntico encuentra la `Notification`, reutiliza su `createdAt`
// y completa las bandejas faltantes con `Put` condicionales idempotentes (sin
// tocar las ya escritas ni reenviar correos).

import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { CreateNotificationResponse, NotificationSegment } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger as defaultLogger } from '../lib/logger';
import { notificationIdFromDedupeKey } from './dedupe';
import { sendPublishedEmails, type SendPublishedEmailsDeps } from './publish-email';
import { resolveSegmentRecipients, type SegmentRecipient } from './segments';

/** Métricas estables para alarmas (ADR-0008). */
export const PUBLISH_METRICS = {
  PARTIAL_PUBLICATION: 'NOTIFICATION_PUBLISH_PARTIAL',
} as const;

/** Ventana en la que dos publicaciones idénticas del mismo administrador son la misma. */
export const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
/** Límite de `TransactWriteItems` de DynamoDB. */
export const TRANSACTION_BLOCK_SIZE = 100;
const RESUME_CONCURRENCY = 10;

export interface PublishNotificationInput {
  segment: NotificationSegment;
  title: string;
  body: string;
  alsoEmail: boolean;
  targetMemberId?: string | undefined;
  resourceId?: string | undefined;
  actor: AuditActor;
  requestId?: string | undefined;
  client?: DynamoDBDocumentClient | undefined;
  now?: Date | undefined;
  /** Dobles inyectables (pruebas): remitente, reloj, espera y logger. */
  email?: SendPublishedEmailsDeps | undefined;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'> | undefined;
}

/**
 * Identificador determinista de la publicación: SHA-256 de administrador,
 * segmento, destino, texto, `alsoEmail` y la ventana de tiempo. Con forma de
 * ULID (mismo codificador que los avisos automáticos).
 */
export function publicationId(input: PublishNotificationInput, nowMs: number): string {
  const bucket = Math.floor(nowMs / IDEMPOTENCY_WINDOW_MS);
  return notificationIdFromDedupeKey(
    JSON.stringify([
      'ADMIN_PUBLISH',
      input.actor.actorId,
      input.segment,
      input.targetMemberId ?? null,
      input.resourceId ?? null,
      input.alsoEmail,
      input.title,
      input.body,
      bucket,
    ]),
  );
}

function notificationItem(
  input: PublishNotificationInput,
  notificationId: string,
  recipientCount: number,
  createdAt: string,
): Record<string, unknown> {
  return {
    ...keys.notification(notificationId),
    ...keys.notificationSent(createdAt, notificationId),
    entityType: 'Notification',
    notificationId,
    title: input.title,
    body: input.body,
    segment: input.segment,
    targetMemberId: input.segment === 'SINGLE' ? (input.targetMemberId ?? null) : null,
    resourceId: input.segment === 'BY_RESOURCE' ? (input.resourceId ?? null) : null,
    event: null,
    alsoEmail: input.alsoEmail,
    createdBy: input.actor.actorId,
    recipientCount,
    createdAt,
  };
}

function inboxItem(
  input: PublishNotificationInput,
  notificationId: string,
  memberId: string,
  createdAt: string,
): Record<string, unknown> {
  return {
    ...keys.memberNotification(memberId, createdAt, notificationId),
    entityType: 'MemberNotification',
    notificationId,
    memberId,
    title: input.title,
    body: input.body,
    event: null,
    readStatus: 'UNREAD',
    createdAt,
    readAt: null,
  };
}

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

function isConditionalFailure(error: unknown): boolean {
  if (errorName(error) === 'ConditionalCheckFailedException') return true;
  if (errorName(error) !== 'TransactionCanceledException') return false;
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons;
  return Array.isArray(reasons) && reasons.some((r) => r.Code === 'ConditionalCheckFailed');
}

async function findNotification(
  client: DynamoDBDocumentClient,
  notificationId: string,
): Promise<{ createdAt: string; recipientCount: number } | null> {
  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.notification(notificationId) }),
  );
  const item = result.Item as { createdAt?: unknown; recipientCount?: unknown } | undefined;
  if (!item || typeof item.createdAt !== 'string') return null;
  return {
    createdAt: item.createdAt,
    recipientCount: typeof item.recipientCount === 'number' ? item.recipientCount : 0,
  };
}

function putOf(item: Record<string, unknown>, conditional: boolean) {
  return {
    Put: {
      TableName: tableName(),
      Item: item,
      ...(conditional ? { ConditionExpression: 'attribute_not_exists(PK)' } : {}),
    },
  };
}

/** Escribe la publicación completa; devuelve cuántas bandejas quedaron escritas. */
async function writeFresh(
  client: DynamoDBDocumentClient,
  input: PublishNotificationInput,
  notificationId: string,
  recipients: SegmentRecipient[],
  createdAt: string,
  log: NonNullable<PublishNotificationInput['logger']>,
  requestId: string,
): Promise<'WRITTEN' | 'RACE'> {
  const head = putOf(notificationItem(input, notificationId, recipients.length, createdAt), true);
  const inbox = recipients.map((r) =>
    putOf(inboxItem(input, notificationId, r.memberId, createdAt), true),
  );

  // El primer bloque lleva la Notification + hasta 99 bandejas.
  const firstBlock = [head, ...inbox.slice(0, TRANSACTION_BLOCK_SIZE - 1)];
  try {
    await client.send(new TransactWriteCommand({ TransactItems: firstBlock }));
  } catch (error) {
    if (isConditionalFailure(error)) return 'RACE';
    throw error;
  }

  let written = firstBlock.length - 1;
  try {
    for (let i = TRANSACTION_BLOCK_SIZE - 1; i < inbox.length; i += TRANSACTION_BLOCK_SIZE) {
      const block = inbox.slice(i, i + TRANSACTION_BLOCK_SIZE);
      await client.send(new TransactWriteCommand({ TransactItems: block }));
      written += block.length;
    }
  } catch (error) {
    log.error('Publicación de notificación incompleta: falló un bloque de bandejas', {
      requestId,
      entityType: 'Notification',
      notificationId,
      action: 'NOTIFICATION_PUBLISH',
      outcome: 'FAILURE',
      metric: PUBLISH_METRICS.PARTIAL_PUBLICATION,
      planned: recipients.length,
      written,
      reason: errorName(error),
    });
    // Deja el historial con el conteo real (best-effort); el reintento completa el resto.
    try {
      await client.send(
        new PutCommand({
          TableName: tableName(),
          Item: notificationItem(input, notificationId, written, createdAt),
        }),
      );
    } catch {
      // El log anterior ya deja el rastro; el reintento corrige el conteo.
    }
    throw new AppError(
      'INTERNAL_ERROR',
      'La publicación no pudo completarse. Reintente en unos minutos: se completará sin duplicar.',
    );
  }
  return 'WRITTEN';
}

/** Completa las bandejas de una publicación ya iniciada. Devuelve nuevas y ya existentes. */
async function resume(
  client: DynamoDBDocumentClient,
  input: PublishNotificationInput,
  notificationId: string,
  recipients: SegmentRecipient[],
  createdAt: string,
): Promise<{ written: number; existing: number }> {
  let written = 0;
  let existing = 0;
  for (let i = 0; i < recipients.length; i += RESUME_CONCURRENCY) {
    const chunk = recipients.slice(i, i + RESUME_CONCURRENCY);
    await Promise.all(
      chunk.map(async (recipient) => {
        try {
          await client.send(
            new PutCommand({
              TableName: tableName(),
              Item: inboxItem(input, notificationId, recipient.memberId, createdAt),
              ConditionExpression: 'attribute_not_exists(PK)',
            }),
          );
          written += 1;
        } catch (error) {
          if (!isConditionalFailure(error)) throw error;
          existing += 1;
        }
      }),
    );
  }
  return { written, existing };
}

export async function publishNotification(
  input: PublishNotificationInput,
): Promise<CreateNotificationResponse> {
  const client = input.client ?? getDocumentClient();
  const log = input.logger ?? defaultLogger;
  const requestId = input.requestId ?? 'notification-publish';
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const startedAtMs = now.getTime();

  // 1. Destinatarios.
  const recipients = await resolveSegmentRecipients(client, {
    segment: input.segment,
    targetMemberId: input.targetMemberId,
    resourceId: input.resourceId,
    now: nowIso,
  });
  if (recipients.length === 0) {
    throw new AppError(
      'NO_RECIPIENTS',
      'El segmento seleccionado no tiene destinatarios; no se publicó ningún aviso.',
    );
  }

  const notificationId = publicationId(input, startedAtMs);
  const baseLog = {
    requestId,
    entityType: 'Notification',
    notificationId,
    action: 'NOTIFICATION_PUBLISH',
    segment: input.segment,
  };

  // 2. ¿Ya existe (reintento)?
  let existing = await findNotification(client, notificationId);

  if (!existing) {
    // 3. Auditoría previa: sin rastro no se publica (ADR-0008).
    await recordAuditLog(client, {
      action: 'NOTIFICATION_SENT',
      actor: input.actor,
      targetType: 'Notification',
      targetId: notificationId,
      metadata: {
        segment: input.segment,
        recipientCount: recipients.length,
        alsoEmail: input.alsoEmail,
        targetMemberId: input.segment === 'SINGLE' ? (input.targetMemberId ?? null) : null,
        resourceId: input.segment === 'BY_RESOURCE' ? (input.resourceId ?? null) : null,
      },
      now: nowIso,
    });

    // 4. Bandeja.
    const outcome = await writeFresh(
      client,
      input,
      notificationId,
      recipients,
      nowIso,
      log,
      requestId,
    );
    if (outcome === 'WRITTEN') {
      // 5. Correo.
      const email = input.alsoEmail
        ? await sendPublishedEmails(
            {
              recipients,
              title: input.title,
              body: input.body,
              startedAtMs,
              requestId,
              notificationId,
            },
            { logger: log, ...input.email },
          )
        : { sent: 0, failed: 0, skipped: 0 };

      log.info('Notificación publicada', {
        ...baseLog,
        outcome: 'SUCCESS',
        recipientCount: recipients.length,
        alsoEmail: input.alsoEmail,
        emailsSent: email.sent,
        emailsFailed: email.failed,
        emailsSkipped: email.skipped,
      });
      return {
        notificationId,
        recipientCount: recipients.length,
        emailsSent: email.sent,
        emailsFailed: email.failed,
        emailsSkipped: email.skipped,
        replayed: false,
      };
    }
    // Carrera con una solicitud idéntica concurrente: pasa a la ruta de reintento.
    existing = await findNotification(client, notificationId);
    if (!existing) {
      throw new AppError(
        'CONFLICT',
        'Hay una publicación idéntica en curso. Reintente en unos segundos.',
      );
    }
  }

  // Reintento idempotente: completa lo que falte, sin correos ni auditoría nueva.
  const resumed = await resume(client, input, notificationId, recipients, existing.createdAt);
  // Si la situación de algún socio cambió entre intentos, su bandeja ya escrita
  // no sale del conteo: nunca se reduce el `recipientCount` guardado.
  const total = Math.max(resumed.written + resumed.existing, existing.recipientCount);
  if (total > existing.recipientCount) {
    await client.send(
      new PutCommand({
        TableName: tableName(),
        Item: notificationItem(input, notificationId, total, existing.createdAt),
      }),
    );
  }
  log.info('Publicación repetida resuelta sin duplicar', {
    ...baseLog,
    outcome: 'SUCCESS',
    recipientCount: total,
    completed: resumed.written,
  });
  return {
    notificationId,
    recipientCount: total,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    replayed: true,
  };
}
