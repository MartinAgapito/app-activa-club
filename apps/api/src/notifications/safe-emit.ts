// Envoltorio defensivo de `emitNotification` para los orquestadores de
// negocio (US-042..US-047). `emitNotification` ya no lanza por fallos de
// DynamoDB/SES; este envoltorio cubre además los errores de programación
// (evento fuera del catálogo, datos mal formados) para que un aviso jamás
// cambie el resultado de una operación de negocio ya confirmada (US-040
// criterios 5 y 7).

import type { NotificationEvent } from '@activa-club/shared-types';

import { logger as defaultLogger } from '../lib/logger';
import {
  emitNotification,
  NOTIFICATION_METRICS,
  type EmitNotificationDeps,
  type EmitNotificationInput,
  type EmitNotificationResult,
} from './emit';

/** Firma inyectable del emisor, para pruebas de los orquestadores. */
export type NotificationEmitter = typeof emitNotification;

export interface SafeEmitDeps extends EmitNotificationDeps {
  /** Emisor inyectable; por defecto `emitNotification`. */
  emit?: NotificationEmitter | undefined;
}

/**
 * Emite la notificación y traga cualquier excepción (la registra con la
 * métrica estable de la bandeja). Devuelve `null` si el emisor lanzó.
 */
export async function safeEmitNotification<E extends NotificationEvent>(
  input: EmitNotificationInput<E>,
  deps: SafeEmitDeps = {},
): Promise<EmitNotificationResult | null> {
  const { emit = emitNotification, ...emitDeps } = deps;
  try {
    return await emit(input, emitDeps);
  } catch (error) {
    (deps.logger ?? defaultLogger).error('La emisión de la notificación lanzó una excepción', {
      requestId: input.requestId ?? 'notification-emit',
      entityType: 'Notification',
      action: 'NOTIFICATION_EMIT',
      outcome: 'FAILURE',
      event: input.event,
      memberId: input.member?.memberId ?? input.memberId,
      metric: NOTIFICATION_METRICS.INBOX_WRITE_FAILED,
      reason: error instanceof Error && error.name ? error.name : 'UnknownError',
    });
    return null;
  }
}
