// Orquestador del proceso diario de vencimiento de membresías (US-038).
//
// Recalcula `membershipStatus` de los socios cuya vigencia cruzó un umbral
// (criterios 2-7) y deja el rastro por transición para US-047 (criterio 11).
// No envía notificaciones, no cambia `memberStatus` ni `outstandingBalance`.
//
// Cómo encuentra candidatos: `Query` sobre GSI2 `MEMBERSHIP#ACTIVE` con
// `endsAt` anterior a "hoy Lima + 9 días" (patrón #15). Los períodos de socios
// `EXPIRED` ya no están en ese índice, así que la consulta crece con los
// socios vigentes/por vencer del club, no con su historia completa. Se agrupa
// por socio y la decisión se toma sobre el `Member` actual (fuente de verdad),
// no sobre el período: un período antiguo ya renovado nunca revierte nada.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getDocumentClient } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { getMemberById } from '../members/repository';
import {
  applyVigencyTransition,
  listActivePeriodsEndingBefore,
  removePeriodFromActiveIndex,
  type ActivePeriodRef,
} from './repository';
import {
  EXPIRING_SOON_THRESHOLD_DAYS,
  addDaysToDateOnly,
  limaDateOnly,
  resolveVigencyTransition,
} from './vigency';

export interface ExpireMembershipsInput {
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido. */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable (pruebas deterministas). */
  now?: Date;
  /** Identificador de la invocación para el log (id del evento programado). */
  requestId?: string;
}

/** Resumen de una ejecución (criterio 10). */
export interface ExpireMembershipsSummary {
  todayLima: string;
  /** Socios distintos evaluados. */
  evaluated: number;
  toExpiringSoon: number;
  toExpired: number;
  /** Socios cuya vigencia cambió mientras corría el proceso (renovación concurrente); no se tocaron. */
  skippedConcurrent: number;
  /** Períodos ya reemplazados por una renovación retirados de GSI2. */
  supersededCleaned: number;
  /** Socios cuya evaluación falló; el resto del lote continuó (criterio 9). */
  errors: number;
}

/**
 * Margen de búsqueda en GSI2: umbral + 2 días. Un `endsAt` UTC puede caer en
 * la fecha calendario siguiente a la de Lima (UTC-5); `GSI2SK < hoy+umbral+2`
 * como cadena incluye todo `endsAt` cuya fecha UTC sea <= hoy+umbral+1, o sea,
 * un superconjunto del conjunto "vence en <= 7 días (Lima)".
 */
const SEARCH_MARGIN_DAYS = EXPIRING_SOON_THRESHOLD_DAYS + 2;

function groupByMember(refs: ActivePeriodRef[]): Map<string, ActivePeriodRef[]> {
  const grouped = new Map<string, ActivePeriodRef[]>();
  for (const ref of refs) {
    const bucket = grouped.get(ref.memberId);
    if (bucket) bucket.push(ref);
    else grouped.set(ref.memberId, [ref]);
  }
  return grouped;
}

export async function expireMemberships(
  input: ExpireMembershipsInput = {},
): Promise<ExpireMembershipsSummary> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const requestId = input.requestId ?? 'expire-memberships';
  const todayLima = limaDateOnly(now);
  const startedAt = Date.now();

  const summary: ExpireMembershipsSummary = {
    todayLima,
    evaluated: 0,
    toExpiringSoon: 0,
    toExpired: 0,
    skippedConcurrent: 0,
    supersededCleaned: 0,
    errors: 0,
  };

  const refs = await listActivePeriodsEndingBefore(
    client,
    addDaysToDateOnly(todayLima, SEARCH_MARGIN_DAYS),
  );

  for (const [memberId, periods] of groupByMember(refs)) {
    summary.evaluated += 1;
    try {
      const member = await getMemberById(client, memberId);
      if (!member) continue;

      // Períodos ya reemplazados por una renovación: salen del índice.
      const current = member.membershipEndsAt;
      for (const period of periods) {
        if (current && period.endsAt < current) {
          if (await removePeriodFromActiveIndex(client, period)) summary.supersededCleaned += 1;
        }
      }

      const target = resolveVigencyTransition({
        membershipStatus: member.membershipStatus,
        membershipEndsAt: current,
        todayLima,
      });
      if (!target || !current) continue;

      const outcome = await applyVigencyTransition(client, {
        memberId,
        from: member.membershipStatus,
        to: target,
        membershipEndsAt: current,
        period: periods.find((period) => period.endsAt === current),
        now: nowIso,
      });

      if (outcome === 'STALE') {
        summary.skippedConcurrent += 1;
      } else if (target === 'EXPIRED') {
        summary.toExpired += 1;
      } else {
        summary.toExpiringSoon += 1;
      }
    } catch (error) {
      summary.errors += 1;
      logger.error('membership vigency evaluation failed', {
        requestId,
        action: 'EXPIRE_MEMBERSHIPS',
        entityType: 'Member',
        outcome: 'FAILURE',
        memberId,
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
    }
  }

  logger.info('membership expiration run completed', {
    requestId,
    action: 'EXPIRE_MEMBERSHIPS',
    entityType: 'Member',
    outcome: summary.errors === 0 ? 'SUCCESS' : 'FAILURE',
    latencyMs: Date.now() - startedAt,
    ...summary,
  });

  return summary;
}
