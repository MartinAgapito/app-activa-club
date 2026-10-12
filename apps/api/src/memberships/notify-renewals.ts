// Proceso diario de avisos de renovación (US-047, RN-NOT-04).
//
// Consume el rastro `MembershipTransition` que deja el proceso de vencimiento
// (US-038, patrón #27) y emite `RENEWAL_DUE` / `RENEWAL_OVERDUE` a través del
// motor de notificaciones (US-040). No cambia `membershipStatus` ni deuda.
//
// Garantías:
//   - Un aviso por transición (criterio 3): el `entityId` es la vigencia
//     (`membershipEndsAt`) de la transición, estable por ciclo; la clave de
//     deduplicación del motor es `evento#socio#vigencia`. Un reintento (o el
//     rastro que quedó pendiente porque falló el retiro) devuelve `DUPLICATE`
//     sin otro correo.
//   - Orden emitir -> retirar de la cola: si el proceso cae entre ambos pasos,
//     el próximo día reintenta y la bandeja idempotente absorbe el duplicado.
//     Si la bandeja falla (`FAILED`) el rastro NO se retira y se reintenta.
//   - Socio sin cuenta digital (criterio 5), con vigencia ya renovada
//     (criterio 6) o con un `RENEWAL_DUE` ya superado por su vencimiento: el
//     rastro se da por procesado sin emitir.
//   - Un error en un socio no detiene al resto (criterio 7).
//
// Privacidad: los logs llevan memberId y nombres de error; nunca correo ni texto.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getDocumentClient } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { getMemberById } from '../members/repository';
import { safeEmitNotification, type SafeEmitDeps } from '../notifications';
import {
  listPendingTransitions,
  markTransitionProcessed,
  type PendingTransition,
  type TransitionProcessedOutcome,
} from './repository';

export interface NotifyRenewalsInput {
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido. */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable (pruebas deterministas). */
  now?: Date;
  /** Identificador de la invocación para el log (id del evento programado). */
  requestId?: string;
  /** Dependencias del motor de notificaciones (pruebas). */
  emitDeps?: SafeEmitDeps;
}

export interface NotifyRenewalsSummary {
  /** Rastros pendientes encontrados en la cola. */
  evaluated: number;
  /** Rastros que terminaron con aviso en la bandeja (nuevo o ya existente). */
  notified: number;
  /** Rastros descartados sin aviso (ya renovó, sin cuenta digital, superado, socio inexistente). */
  skipped: number;
  /** Avisos que el motor reportó como ya emitidos antes (reintento); subconjunto de `notified`. */
  duplicates: number;
  /** Rastros que fallaron y siguen en la cola para el próximo día (criterio 7). */
  errors: number;
}

type Decision = { outcome: TransitionProcessedOutcome; duplicate: boolean } | 'RETRY';

async function decide(
  client: DynamoDBDocumentClient,
  transition: PendingTransition,
  requestId: string,
  emitDeps: SafeEmitDeps,
  now: string,
): Promise<Decision> {
  const member = await getMemberById(client, transition.memberId);
  if (!member) return { outcome: 'SKIPPED_MEMBER_NOT_FOUND', duplicate: false };

  // Criterio 5: sin cuenta digital no hay a quién avisar.
  if (member.memberStatus !== 'ACTIVE') {
    return { outcome: 'SKIPPED_NOT_ELIGIBLE', duplicate: false };
  }
  // Criterio 6: renovó (la vigencia actual ya no es la que originó la transición).
  if (member.membershipEndsAt !== transition.membershipEndsAt) {
    return { outcome: 'SKIPPED_RENEWED', duplicate: false };
  }
  // Un aviso de "por vencer" ya no tiene sentido si el socio ya venció.
  if (transition.event === 'RENEWAL_DUE' && member.membershipStatus === 'EXPIRED') {
    return { outcome: 'SKIPPED_SUPERSEDED', duplicate: false };
  }

  const result = await safeEmitNotification(
    {
      event: transition.event,
      data: { membershipEndsAt: transition.membershipEndsAt },
      entityId: transition.membershipEndsAt,
      member: {
        memberId: member.memberId,
        email: member.email,
        firstName: member.firstName,
      },
      now,
      requestId,
    },
    { client, ...emitDeps },
  );

  if (!result || result.inbox === 'FAILED') return 'RETRY';
  return { outcome: 'NOTIFIED', duplicate: result.inbox === 'DUPLICATE' };
}

export async function notifyRenewals(
  input: NotifyRenewalsInput = {},
): Promise<NotifyRenewalsSummary> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();
  const requestId = input.requestId ?? 'notify-renewals';
  const emitDeps = input.emitDeps ?? {};
  const startedAt = Date.now();

  const summary: NotifyRenewalsSummary = {
    evaluated: 0,
    notified: 0,
    skipped: 0,
    duplicates: 0,
    errors: 0,
  };

  const pending = await listPendingTransitions(client);

  for (const transition of pending) {
    summary.evaluated += 1;
    try {
      const decision = await decide(client, transition, requestId, emitDeps, now);
      if (decision === 'RETRY') {
        summary.errors += 1;
        logger.error('renewal notification not delivered, will retry', {
          requestId,
          action: 'NOTIFY_RENEWALS',
          entityType: 'MembershipTransition',
          outcome: 'FAILURE',
          memberId: transition.memberId,
          event: transition.event,
        });
        continue;
      }

      await markTransitionProcessed(client, transition, decision.outcome, now);
      if (decision.outcome === 'NOTIFIED') {
        summary.notified += 1;
        if (decision.duplicate) summary.duplicates += 1;
      } else {
        summary.skipped += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error('renewal notification processing failed', {
        requestId,
        action: 'NOTIFY_RENEWALS',
        entityType: 'MembershipTransition',
        outcome: 'FAILURE',
        memberId: transition.memberId,
        event: transition.event,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  logger.info('renewal notification run completed', {
    requestId,
    action: 'NOTIFY_RENEWALS',
    entityType: 'MembershipTransition',
    outcome: summary.errors === 0 ? 'SUCCESS' : 'FAILURE',
    latencyMs: Date.now() - startedAt,
    ...summary,
  });

  return summary;
}
