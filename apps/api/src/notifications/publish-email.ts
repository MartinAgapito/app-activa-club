// Correo opcional de una publicación segmentada (US-048, RN-NOT-02, ADR-0006).
//
// Best-effort y acotado por tiempo: la Lambda de `POST /notifications` tiene
// 29 s (límite de API Gateway REST) y SES en sandbox acepta 1 mensaje por
// segundo, así que no se puede enviar al padrón completo en una petición.
//   - Máximo `MAX_EMAILS_PER_PUBLICATION` correos por publicación.
//   - Se espacian `EMAIL_MIN_INTERVAL_MS` entre envíos (sandbox: 1/s).
//   - No se inicia ningún envío pasado `EMAIL_TIME_BUDGET_MS` desde que
//     empezó la publicación.
// Lo que no cabe se reporta como `skipped`; la bandeja interna (obligatoria)
// ya está escrita y nunca depende de esto. Un fallo de SES no se propaga.
//
// Privacidad: los logs llevan solo contadores y el nombre del error, nunca el
// correo del destinatario ni el contenido del aviso.

import { logger as defaultLogger } from '../lib/logger';
import { optionalEnv } from '../lib/env';
import { renderEmailLayout, safeAppUrl } from './email-layout';
import { createSesEmailSender, getSenderEmail, type EmailSender } from './mailer';
import { NOTIFICATION_METRICS } from './emit';
import type { SegmentRecipient } from './segments';

/** Máximo de correos por publicación (15 envíos a 1/s ≈ 16 s de los 29 s de la Lambda). */
export const MAX_EMAILS_PER_PUBLICATION = 15;
/** Separación mínima entre envíos: SES sandbox acepta 1 mensaje por segundo. */
export const EMAIL_MIN_INTERVAL_MS = 1100;
/** Pasado este tiempo desde el inicio de la publicación no se lanzan más envíos. */
export const EMAIL_TIME_BUDGET_MS = 22_000;

const SIGNATURE = 'Equipo Activa Club';

export interface PublishedEmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * Texto del correo de una publicación. Título y cuerpo son texto plano: en
 * HTML se escapan (criterio 11), nunca se interpretan.
 */
export function renderPublishedEmail(
  title: string,
  body: string,
  firstName: string,
): PublishedEmailContent {
  const hello = firstName ? `Hola ${firstName},` : 'Hola,';
  const appUrl = safeAppUrl(optionalEnv('APP_BASE_URL'));
  const link = appUrl ? `Ingresa a Activa Club: ${appUrl}\n\n` : '';
  return {
    subject: `Activa Club: ${title}`,
    text: `${hello}\n\n${title}\n\n${body}\n\n${link}${SIGNATURE}\n`,
    html: renderEmailLayout({
      preheader: body,
      heading: title,
      paragraphs: [hello, body],
      closing: SIGNATURE,
      appUrl,
    }),
  };
}

export interface EmailBatchResult {
  sent: number;
  failed: number;
  skipped: number;
}

export interface SendPublishedEmailsInput {
  recipients: readonly SegmentRecipient[];
  title: string;
  body: string;
  /** Instante (ms) en que empezó la publicación, para el presupuesto de tiempo. */
  startedAtMs: number;
  requestId: string;
  notificationId: string;
}

export interface SendPublishedEmailsDeps {
  /** `null` fuerza "remitente no configurado"; `undefined` usa SES. */
  emailSender?: EmailSender | null | undefined;
  clock?: () => number;
  sleep?: (ms: number) => Promise<void>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error'>;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Envía los correos con tope, ritmo y presupuesto de tiempo. Nunca lanza. */
export async function sendPublishedEmails(
  input: SendPublishedEmailsInput,
  deps: SendPublishedEmailsDeps = {},
): Promise<EmailBatchResult> {
  const log = deps.logger ?? defaultLogger;
  const clock = deps.clock ?? Date.now;
  const sleep = deps.sleep ?? realSleep;
  const total = input.recipients.length;
  const result: EmailBatchResult = { sent: 0, failed: 0, skipped: 0 };
  const baseLog = {
    requestId: input.requestId,
    entityType: 'Notification',
    notificationId: input.notificationId,
    action: 'NOTIFICATION_PUBLISH_EMAIL',
  };

  let sender: EmailSender | null;
  try {
    if (deps.emailSender !== undefined) {
      sender = deps.emailSender;
    } else {
      const address = getSenderEmail();
      sender = address ? createSesEmailSender(address) : null;
    }
  } catch {
    sender = null;
  }
  if (sender === null) {
    log.warn('Correo de la publicación omitido: remitente no configurado', {
      ...baseLog,
      outcome: 'FAILURE',
      reason: 'SENDER_NOT_CONFIGURED',
      skipped: total,
    });
    return { sent: 0, failed: 0, skipped: total };
  }

  let attempts = 0;
  let lastAttemptAt: number | null = null;
  for (const recipient of input.recipients) {
    if (!recipient.email) {
      result.skipped += 1;
      continue;
    }
    if (attempts >= MAX_EMAILS_PER_PUBLICATION) {
      result.skipped += 1;
      continue;
    }
    if (lastAttemptAt !== null) {
      const wait = EMAIL_MIN_INTERVAL_MS - (clock() - lastAttemptAt);
      if (wait > 0) await sleep(wait);
    }
    if (clock() - input.startedAtMs > EMAIL_TIME_BUDGET_MS) {
      result.skipped += 1;
      continue;
    }

    attempts += 1;
    lastAttemptAt = clock();
    const content = renderPublishedEmail(input.title, input.body, recipient.firstName);
    try {
      await sender.send({
        to: recipient.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      });
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      log.warn('No se pudo enviar el correo de la publicación', {
        ...baseLog,
        outcome: 'FAILURE',
        metric: NOTIFICATION_METRICS.EMAIL_SEND_FAILED,
        reason: error instanceof Error && error.name ? error.name : 'UnknownError',
      });
    }
  }

  if (result.skipped > 0) {
    log.warn('Correos de la publicación omitidos por tope, tiempo o falta de correo', {
      ...baseLog,
      outcome: 'SUCCESS',
      reason: 'EMAIL_LIMIT_OR_TIME_BUDGET',
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
  }
  return result;
}
