// Derivados del estado de membresía para el inicio (US-070). Solo
// presentación: el servidor sigue siendo la fuente de verdad.

import type { Member } from '@activa-club/shared-types';
import { daysUntilInLima } from '../lib/format/lima-time';

export const EXPIRING_WINDOW_DAYS = 7;

export type MembershipAction = 'PAY' | 'RENEW' | null;

export interface MembershipSummary {
  /** Días hasta el vencimiento; `null` si no hay fecha. */
  daysLeft: number | null;
  action: MembershipAction;
  /** Etiqueta del botón contextual; `null` si está al día. */
  actionLabel: string | null;
}

export function summarizeMembership(
  member: Pick<Member, 'membershipStatus' | 'membershipEndsAt' | 'outstandingBalance'>,
  now: Date,
): MembershipSummary {
  const daysLeft = member.membershipEndsAt ? daysUntilInLima(member.membershipEndsAt, now) : null;
  const owes = member.membershipStatus === 'DEBT' || member.outstandingBalance > 0;

  if (owes || member.membershipStatus === 'NONE') {
    return { daysLeft, action: 'PAY', actionLabel: 'Pagar membresía' };
  }
  const expiringSoon =
    member.membershipStatus === 'EXPIRING_SOON' ||
    (member.membershipStatus === 'ACTIVE' &&
      daysLeft !== null &&
      daysLeft >= 0 &&
      daysLeft <= EXPIRING_WINDOW_DAYS);
  if (member.membershipStatus === 'EXPIRED' || expiringSoon) {
    return { daysLeft, action: 'RENEW', actionLabel: 'Renovar membresía' };
  }
  return { daysLeft, action: null, actionLabel: null };
}

export function daysLabel(days: number): string {
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days} días`;
}
