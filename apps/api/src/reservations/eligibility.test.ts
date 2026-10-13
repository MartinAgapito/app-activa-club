import { describe, expect, it } from 'vitest';
import type { Member } from '@activa-club/shared-types';

import { canMemberReserve, getReservationBlocker } from './eligibility';

const now = new Date('2026-07-10T15:00:00.000Z');

function member(overrides: Partial<Member> = {}): Member {
  return {
    memberId: 'm1',
    legacyId: null,
    dni: '45678912',
    email: 'maria@example.com',
    firstName: 'María',
    lastName: 'Quispe',
    phone: '999888777',
    origin: 'NEW',
    memberStatus: 'ACTIVE',
    cognitoSub: 'sub-1',
    rejectionReason: null,
    membershipType: 'ANNUAL',
    membershipStatus: 'ACTIVE',
    membershipStartedAt: '2026-01-01T00:00:00.000Z',
    membershipEndsAt: '2026-12-31T05:00:00.000Z',
    outstandingBalance: 0,
    autoRenew: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Member;
}

describe('reservations/eligibility', () => {
  it('socio activo al día puede reservar', () => {
    expect(getReservationBlocker(member(), now)).toBeNull();
    expect(canMemberReserve(member(), now)).toBe(true);
  });

  it('socio no ACTIVE -> MEMBERSHIP_REQUIRED', () => {
    expect(getReservationBlocker(member({ memberStatus: 'APPROVED' }), now)).toBe(
      'MEMBERSHIP_REQUIRED',
    );
  });

  it.each([
    ['deuda', { membershipStatus: 'DEBT' as const }],
    ['vencida', { membershipStatus: 'EXPIRED' as const }],
    ['saldo pendiente', { outstandingBalance: 50 }],
    ['vencida por fecha sin proceso', { membershipEndsAt: '2026-07-09T05:00:00.000Z' }],
  ])('%s -> MEMBER_HAS_DEBT', (_label, overrides) => {
    expect(getReservationBlocker(member(overrides), now)).toBe('MEMBER_HAS_DEBT');
    expect(canMemberReserve(member(overrides), now)).toBe(false);
  });
});
