// Métricas de socios, membresías, reservas pendientes, pagos y notificaciones
// de `GET /dashboard/admin` (US-057, docs/api/contratos-api.md §9,
// RN-ANL-01, RN-ANL-02, RN-ANL-05, RN-ANL-06, RN-ANL-08).
//
// Solo cantidades (sin datos personales) y solo lectura: cada cifra es un
// `Query ... Select: COUNT` sobre un patrón de acceso del modelo (sin `Scan`),
// que DynamoDB cuenta sin devolver los ítems:
//
// | Cifra                      | Patrón | Consulta                                            |
// | -------------------------- | ------ | --------------------------------------------------- |
// | membersByStatus            | #14    | GSI2PK=MEMBER#STATUS#<s>, una consulta por estado   |
// | membershipsExpiringSoon    | #28    | GSI2PK=MEMBER#STATUS#ACTIVE + filtro                |
// |                            |        | membershipStatus=EXPIRING_SOON (igual que US-052)   |
// | pendingApprovals           | #17    | GSI2PK=RESERVATION#STATUS#PENDING_APPROVAL,         |
// |                            |        | GSI2SK >= <ahora> (inicio aún no pasó)              |
// | payments.succeeded/failed  | #16/29 | GSI2PK=PAYMENT#STATUS#<s>, GSI2SK BETWEEN [from,to)|
// | notificationsSent          | #18    | GSI2PK=NOTIFICATION#SENT, GSI2SK BETWEEN [from,to)  |
//
// Límites (documentados en docs/data/modelo-dynamodb.md, nota de #14/#28):
// - Una consulta lee hasta 1 MB por página. Los conteos sin filtro (todas
//   excepto `membershipsExpiringSoon`) cobran por lo leído, no por lo contado;
//   con el padrón del MVP (cientos de socios) es una sola página. Para
//   acotar el costo de peor caso se leen como máximo `MAX_COUNT_PAGES` páginas
//   por cifra; si se agota, la cifra queda como piso y se emite un WARN
//   `DASHBOARD_COUNT_TRUNCATED` (no se falla el dashboard por eso).
// - `membershipsExpiringSoon` filtra dentro de la partición `ACTIVE`: el filtro
//   no reduce lo leído, solo lo contado (mismo límite que #28, ADR-0014).
// - Los pagos del período se ubican por `createdAt` (es la clave del índice),
//   no por `confirmedAt`; un pago creado el 31 y confirmado el 1 cuenta en el
//   mes del 31. `PENDING_CONFIRMATION` no se cuenta.
// - `notificationsSent` cuenta todos los registros `Notification` del período,
//   manuales y automáticos (propuesta de la pregunta abierta 6 de EP-07); es
//   el mismo universo que lista `GET /notifications/sent`.

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MemberStatus } from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { logger } from '../lib/logger';
import { CLUB_TIME_ZONE, limaMonthKey, limaWallTimeToUtc } from '../reservations/time';

/** Estados de socio que reporta `membersByStatus` (siempre todos, incluidos los ceros). */
export const MEMBER_STATUSES: readonly MemberStatus[] = [
  'MIGRATED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'ACTIVE',
];

/** Tope de páginas de 1 MB que se leen por cifra (peor caso ≈ 10 MB por cifra). */
export const MAX_COUNT_PAGES = 10;

/** Ventana semiabierta `[from, to)` expresada en UTC (contrato §9, `periods`). */
export interface DashboardPeriod {
  from: string;
  to: string;
  timeZone: string;
}

export interface AdminPeopleMetrics {
  periods: { currentMonth: DashboardPeriod };
  membersByStatus: Record<MemberStatus, number>;
  membershipsExpiringSoon: number;
  pendingApprovals: number;
  payments: { succeeded: number; failed: number };
  notificationsSent: number;
}

export interface AdminPeopleMetricsInput {
  /** Instante de la consulta (inyectable para pruebas). */
  now?: Date | undefined;
  requestId?: string | undefined;
  client?: DynamoDBDocumentClient | undefined;
}

/**
 * Mes calendario en curso en `America/Lima`: día 1 00:00 -> día 1 del mes
 * siguiente 00:00, en UTC. Funciona en el cruce de año (diciembre -> enero).
 */
export function currentMonthPeriod(now: Date): DashboardPeriod {
  const monthKey = limaMonthKey(now);
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const pad = (n: number): string => String(n).padStart(2, '0');

  return {
    from: limaWallTimeToUtc(`${year}-${pad(month)}-01`, '00:00').toISOString(),
    to: limaWallTimeToUtc(`${nextYear}-${pad(nextMonth)}-01`, '00:00').toISOString(),
    timeZone: CLUB_TIME_ZONE,
  };
}

interface CountQuery {
  label: string;
  keyCondition: string;
  values: Record<string, unknown>;
  filter?: { expression: string; names: Record<string, string> };
}

/** Cuenta ítems de GSI2 con `Select: COUNT`, siguiendo `LastEvaluatedKey` hasta el tope. */
async function countGsi2(
  client: DynamoDBDocumentClient,
  query: CountQuery,
  requestId: string,
): Promise<number> {
  let total = 0;
  let startKey: Record<string, unknown> | undefined;

  for (let page = 0; page < MAX_COUNT_PAGES; page += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: query.keyCondition,
        ExpressionAttributeValues: query.values,
        ...(query.filter
          ? {
              FilterExpression: query.filter.expression,
              ExpressionAttributeNames: query.filter.names,
            }
          : {}),
        Select: 'COUNT',
        ExclusiveStartKey: startKey,
      }),
    );
    total += result.Count ?? 0;
    startKey = result.LastEvaluatedKey;
    if (!startKey) return total;
  }

  logger.warn('dashboard count truncated', {
    requestId,
    action: 'DASHBOARD_COUNT_TRUNCATED',
    entityType: 'Dashboard',
    metric: query.label,
    pagesRead: MAX_COUNT_PAGES,
  });
  return total;
}

function countMembersByStatus(
  client: DynamoDBDocumentClient,
  status: MemberStatus,
  requestId: string,
): Promise<number> {
  return countGsi2(
    client,
    {
      label: `membersByStatus.${status}`,
      keyCondition: 'GSI2PK = :pk',
      values: { ':pk': keys.membersByStatus(status).GSI2PK },
    },
    requestId,
  );
}

function countExpiringSoon(client: DynamoDBDocumentClient, requestId: string): Promise<number> {
  return countGsi2(
    client,
    {
      label: 'membershipsExpiringSoon',
      keyCondition: 'GSI2PK = :pk',
      values: { ':pk': keys.membersByStatus('ACTIVE').GSI2PK, ':expiring': 'EXPIRING_SOON' },
      filter: {
        expression: '#membershipStatus = :expiring',
        names: { '#membershipStatus': 'membershipStatus' },
      },
    },
    requestId,
  );
}

function countPendingApprovals(
  client: DynamoDBDocumentClient,
  now: Date,
  requestId: string,
): Promise<number> {
  return countGsi2(
    client,
    {
      label: 'pendingApprovals',
      keyCondition: 'GSI2PK = :pk AND GSI2SK >= :now',
      values: {
        ':pk': keys.reservationsByStatus('PENDING_APPROVAL').GSI2PK,
        ':now': now.toISOString(),
      },
    },
    requestId,
  );
}

function countPaymentsByStatus(
  client: DynamoDBDocumentClient,
  status: 'SUCCEEDED' | 'FAILED',
  period: DashboardPeriod,
  requestId: string,
): Promise<number> {
  // BETWEEN es inclusivo, pero la clave real es `<createdAt>#<paymentId>`: un
  // pago con createdAt == `to` queda fuera (ventana semiabierta, modelo #29).
  return countGsi2(
    client,
    {
      label: `payments.${status}`,
      keyCondition: 'GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to',
      values: {
        ':pk': keys.paymentsByStatus(status).GSI2PK,
        ':from': period.from,
        ':to': period.to,
      },
    },
    requestId,
  );
}

function countNotificationsSent(
  client: DynamoDBDocumentClient,
  period: DashboardPeriod,
  requestId: string,
): Promise<number> {
  return countGsi2(
    client,
    {
      label: 'notificationsSent',
      keyCondition: 'GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to',
      values: {
        ':pk': keys.notificationSent('', '').GSI2PK,
        ':from': period.from,
        ':to': period.to,
      },
    },
    requestId,
  );
}

/** Calcula las secciones de US-057 de `GET /dashboard/admin`; todas las consultas en paralelo. */
export async function computeAdminPeopleMetrics(
  input: AdminPeopleMetricsInput = {},
): Promise<AdminPeopleMetrics> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const requestId = input.requestId ?? 'dashboard-admin';
  const currentMonth = currentMonthPeriod(now);

  const [memberCounts, expiringSoon, pendingApprovals, succeeded, failed, notificationsSent] =
    await Promise.all([
      Promise.all(MEMBER_STATUSES.map((s) => countMembersByStatus(client, s, requestId))),
      countExpiringSoon(client, requestId),
      countPendingApprovals(client, now, requestId),
      countPaymentsByStatus(client, 'SUCCEEDED', currentMonth, requestId),
      countPaymentsByStatus(client, 'FAILED', currentMonth, requestId),
      countNotificationsSent(client, currentMonth, requestId),
    ]);

  const membersByStatus = Object.fromEntries(
    MEMBER_STATUSES.map((status, index) => [status, memberCounts[index] ?? 0]),
  ) as Record<MemberStatus, number>;

  return {
    periods: { currentMonth },
    membersByStatus,
    membershipsExpiringSoon: expiringSoon,
    pendingApprovals,
    payments: { succeeded, failed },
    notificationsSent,
  };
}
