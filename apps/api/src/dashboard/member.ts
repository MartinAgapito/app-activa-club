// Orquestador de `GET /dashboard/member` (US-055, docs/api/contratos-api.md §9;
// RN-PAG-06, RN-RES-12, RN-RES-06, RN-NOT-01). Solo lectura: una resolución del
// socio por `cognitoSub` (patrón #11), sus próximas reservas como titular
// (patrón #12, GSI1) y su bandeja (patrón #5). Nunca recibe un `memberId` del
// cliente ni devuelve datos de otros socios.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  Member,
  MemberDashboard,
  MemberDashboardAlert,
  MemberDashboardMembership,
  MembershipStatus,
} from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import {
  daysBetween,
  limaDateOnly,
  resolveVigencyTransition,
  toLimaDate,
} from '../memberships/vigency';
import { listInbox } from '../notifications/repository';
import { canMemberReserve } from '../reservations/eligibility';
import { listUpcomingReservationsByHolder } from '../reservations/repository';

/** Máximo de reservas próximas y de avisos recientes que devuelve el resumen (criterios 5 y 6). */
export const DASHBOARD_LIST_SIZE = 5;

/** Códigos estables de alerta del socio (contrato §9). */
export const MEMBER_ALERT_CODES = {
  RENEWAL_DUE: 'RENEWAL_DUE',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  PAYMENT_DEBT: 'PAYMENT_DEBT',
} as const;

export interface GetMemberDashboardInput {
  cognitoSub: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

/**
 * Estado de membresía efectivo a hoy (Lima): si el proceso diario (US-038)
 * todavía no corrió, un `ACTIVE`/`EXPIRING_SOON` ya vencido figura `EXPIRED` y
 * un `ACTIVE` dentro del umbral figura `EXPIRING_SOON`. Reusa la regla única de
 * `memberships/vigency.ts`.
 */
function effectiveMembershipStatus(member: Member, todayLima: string): MembershipStatus {
  const transition = resolveVigencyTransition({
    membershipStatus: member.membershipStatus,
    membershipEndsAt: member.membershipEndsAt,
    todayLima,
  });
  return transition ?? member.membershipStatus;
}

/** `daysRemaining` en días calendario de Lima; `null` sin vigencia o ya vencida (criterio 2). */
export function computeDaysRemaining(endsAt: string | null, todayLima: string): number | null {
  if (!endsAt) return null;
  const days = daysBetween(todayLima, toLimaDate(endsAt));
  return days < 0 ? null : days;
}

function renewalMessage(daysRemaining: number | null): string {
  if (daysRemaining === 0) return 'Tu membresía vence hoy.';
  if (daysRemaining === 1) return 'Tu membresía vence mañana.';
  if (daysRemaining !== null) return `Tu membresía vence en ${daysRemaining} días.`;
  return 'Tu membresía vence pronto.';
}

/** Una alerta por cada situación que requiere acción (criterio 4). */
export function buildAlerts(
  member: Member,
  status: MembershipStatus,
  daysRemaining: number | null,
): MemberDashboardAlert[] {
  const alerts: MemberDashboardAlert[] = [];
  if (status === 'EXPIRING_SOON') {
    alerts.push({ code: MEMBER_ALERT_CODES.RENEWAL_DUE, message: renewalMessage(daysRemaining) });
  }
  if (status === 'EXPIRED') {
    alerts.push({
      code: MEMBER_ALERT_CODES.MEMBERSHIP_EXPIRED,
      message: 'Tu membresía venció. Renuévala para volver a reservar.',
    });
  }
  if (status === 'DEBT' || member.outstandingBalance > 0) {
    alerts.push({
      code: MEMBER_ALERT_CODES.PAYMENT_DEBT,
      message: 'Tienes un saldo pendiente. Regulariza tu pago para volver a reservar.',
    });
  }
  return alerts;
}

export async function getMemberDashboard(input: GetMemberDashboardInput): Promise<MemberDashboard> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const todayLima = limaDateOnly(now);

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  const [upcoming, inbox] = await Promise.all([
    listUpcomingReservationsByHolder(
      client,
      member.memberId,
      now.toISOString(),
      DASHBOARD_LIST_SIZE,
    ),
    listInbox(client, member.memberId, { limit: DASHBOARD_LIST_SIZE }),
  ]);

  const status = effectiveMembershipStatus(member, todayLima);
  const daysRemaining = computeDaysRemaining(member.membershipEndsAt, todayLima);
  const membership: MemberDashboardMembership = {
    type: member.membershipType,
    status,
    endsAt: member.membershipEndsAt,
    daysRemaining,
    outstandingBalance: member.outstandingBalance,
  };

  return {
    member: { firstName: member.firstName, memberStatus: member.memberStatus },
    membership,
    // Misma función que `POST /reservations` (criterio 3).
    canReserve: canMemberReserve(member, now),
    alerts: buildAlerts(member, status, daysRemaining),
    upcomingReservations: upcoming.map((reservation) => ({
      reservationId: reservation.reservationId,
      resourceType: reservation.resourceType,
      startsAt: reservation.startsAt,
      reservationStatus: reservation.reservationStatus,
    })),
    recentNotifications: inbox.items.slice(0, DASHBOARD_LIST_SIZE).map((notification) => ({
      notificationId: notification.notificationId,
      title: notification.title,
      readStatus: notification.readStatus,
    })),
  };
}
