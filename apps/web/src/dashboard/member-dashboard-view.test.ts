import { describe, expect, it } from 'vitest';
import type { MemberDashboard } from '@activa-club/shared-types';
import {
  daysLabel,
  formatMembershipEnd,
  membershipAction,
  reservationBlockedReason,
} from './member-dashboard-view';

function base(overrides: Partial<MemberDashboard> = {}): MemberDashboard {
  return {
    member: { firstName: 'Ana', memberStatus: 'ACTIVE' },
    membership: {
      type: 'MONTHLY',
      status: 'ACTIVE',
      endsAt: '2026-12-01T05:00:00Z',
      daysRemaining: 50,
      outstandingBalance: 0,
    },
    canReserve: true,
    alerts: [],
    upcomingReservations: [],
    recentNotifications: [],
    ...overrides,
  };
}

describe('membershipAction', () => {
  it('al día: sin acción', () => {
    expect(membershipAction(base()).action).toBeNull();
  });

  it('por vencer o vencida: renovar', () => {
    const expiring = base({
      membership: { ...base().membership, status: 'EXPIRING_SOON', daysRemaining: 3 },
      alerts: [{ code: 'RENEWAL_DUE', message: 'x' }],
    });
    expect(membershipAction(expiring).action).toBe('RENEW');
    const expired = base({ membership: { ...base().membership, status: 'EXPIRED' } });
    expect(membershipAction(expired).action).toBe('RENEW');
  });

  it('deuda, saldo o sin membresía: pagar', () => {
    expect(
      membershipAction(base({ membership: { ...base().membership, status: 'DEBT' } })).action,
    ).toBe('PAY');
    expect(
      membershipAction(base({ membership: { ...base().membership, outstandingBalance: 100 } }))
        .action,
    ).toBe('PAY');
    expect(
      membershipAction(base({ membership: { ...base().membership, status: 'NONE' } })).action,
    ).toBe('PAY');
  });
});

describe('reservationBlockedReason', () => {
  it('prioriza deuda, luego vencida, luego sin membresía', () => {
    expect(
      reservationBlockedReason(
        base({ membership: { ...base().membership, status: 'DEBT', outstandingBalance: 1 } }),
      ),
    ).toMatch(/saldo pendiente/);
    expect(
      reservationBlockedReason(base({ membership: { ...base().membership, status: 'EXPIRED' } })),
    ).toMatch(/venció/);
    expect(
      reservationBlockedReason(base({ membership: { ...base().membership, status: 'NONE' } })),
    ).toMatch(/primera membresía/);
  });

  it('sin señal clara usa el primer aviso del servidor o un texto genérico', () => {
    expect(
      reservationBlockedReason(base({ alerts: [{ code: 'OTRA', message: 'Motivo X' }] })),
    ).toBe('Motivo X');
    expect(reservationBlockedReason(base())).toMatch(/Regulariza tu membresía/);
  });
});

describe('formatMembershipEnd', () => {
  it('acepta fecha sin hora y ISO con hora (día de Lima)', () => {
    expect(formatMembershipEnd('2026-12-01')).toMatch(/1 dic.? 2026/);
    // 03:00Z del 2 sigue siendo el 1 en Lima (UTC-5).
    expect(formatMembershipEnd('2026-12-02T03:00:00Z')).toMatch(/1 dic.? 2026/);
  });

  it('null o inválida: sin fecha', () => {
    expect(formatMembershipEnd(null)).toBeNull();
    expect(formatMembershipEnd('no-es-fecha')).toBeNull();
  });
});

describe('daysLabel', () => {
  it('hoy, mañana y plural', () => {
    expect(daysLabel(0)).toBe('Vence hoy');
    expect(daysLabel(1)).toBe('Vence mañana');
    expect(daysLabel(6)).toBe('Vence en 6 días');
  });
});
