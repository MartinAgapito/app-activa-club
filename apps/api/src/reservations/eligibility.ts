// Elegibilidad del titular para reservar (RN-RES-12, RN-PAG-06; US-030 criterios
// 10/11, US-038 criterio 8). Única fuente de la regla: la usan
// `POST /reservations` (`./create.ts`, que la convierte en error) y
// `GET /dashboard/member` (`../dashboard/member.ts`, que la expone como
// `canReserve`, US-055 criterio 3). Puro, sin AWS: el "ahora" lo pasa el llamante.

import type { Member } from '@activa-club/shared-types';

import { hasMembershipEnded, limaDateOnly } from '../memberships/vigency';

const NON_RESERVABLE_MEMBERSHIP_STATUSES: ReadonlySet<Member['membershipStatus']> = new Set([
  'DEBT',
  'EXPIRED',
]);

/**
 * Defensa en profundidad (US-038, criterio 8): un socio que figura vigente
 * (`ACTIVE`/`EXPIRING_SOON`) pero cuyo `membershipEndsAt` ya pasó (fecha de
 * Lima) no puede reservar aunque el proceso diario de vencimiento todavía no
 * haya corrido.
 */
export function hasLapsedWhileMarkedCurrent(member: Member, now: Date): boolean {
  if (member.membershipStatus !== 'ACTIVE' && member.membershipStatus !== 'EXPIRING_SOON') {
    return false;
  }
  if (!member.membershipEndsAt) return false;
  return hasMembershipEnded(member.membershipEndsAt, limaDateOnly(now));
}

/** Motivo por el que el socio no puede reservar, o `null` si puede. */
export type ReservationBlocker = 'MEMBERSHIP_REQUIRED' | 'MEMBER_HAS_DEBT';

/**
 * Solo un socio `ACTIVE`, sin deuda (`membershipStatus` fuera de
 * `DEBT`/`EXPIRED`), sin saldo pendiente y con vigencia no vencida por fecha
 * puede confirmar una reserva.
 */
export function getReservationBlocker(member: Member, now: Date): ReservationBlocker | null {
  if (member.memberStatus !== 'ACTIVE') return 'MEMBERSHIP_REQUIRED';
  if (
    NON_RESERVABLE_MEMBERSHIP_STATUSES.has(member.membershipStatus) ||
    member.outstandingBalance > 0 ||
    hasLapsedWhileMarkedCurrent(member, now)
  ) {
    return 'MEMBER_HAS_DEBT';
  }
  return null;
}

export function canMemberReserve(member: Member, now: Date): boolean {
  return getReservationBlocker(member, now) === null;
}
