import { describe, expect, it } from 'vitest';
import type { MembershipStatus } from '@activa-club/shared-types';

import { resolveMembershipCycle } from './membership-cycle';

describe('resolveMembershipCycle — primer pago', () => {
  it.each<MembershipStatus>(['NONE', 'EXPIRED', 'DEBT'])(
    'parte de la fecha de confirmación del pago cuando membershipStatus=%s (mensual, criterio 1/3)',
    (status) => {
      const result = resolveMembershipCycle({
        membershipType: 'MONTHLY',
        paymentConfirmedAt: '2026-08-09T15:00:00.000Z',
        currentMembershipStatus: status,
        currentMembershipEndsAt: null,
      });

      expect(result.kind).toBe('FIRST_PAYMENT');
      expect(result.startedAt).toBe('2026-08-09T15:00:00.000Z');
      expect(result.endsAt).toBe('2026-09-09T15:00:00.000Z');
    },
  );

  it('anual: termina un año después de la confirmación del pago', () => {
    const result = resolveMembershipCycle({
      membershipType: 'ANNUAL',
      paymentConfirmedAt: '2026-08-09T15:00:00.000Z',
      currentMembershipStatus: 'NONE',
      currentMembershipEndsAt: null,
    });

    expect(result.kind).toBe('FIRST_PAYMENT');
    expect(result.endsAt).toBe('2027-08-09T15:00:00.000Z');
  });

  it('un socio ACTIVE sin membershipEndsAt registrado (dato inconsistente) se trata como primer pago', () => {
    const result = resolveMembershipCycle({
      membershipType: 'MONTHLY',
      paymentConfirmedAt: '2026-08-09T15:00:00.000Z',
      currentMembershipStatus: 'ACTIVE',
      currentMembershipEndsAt: null,
    });

    expect(result.kind).toBe('FIRST_PAYMENT');
    expect(result.startedAt).toBe('2026-08-09T15:00:00.000Z');
  });

  it('ajusta el fin de mes cuando el día de inicio no existe en el mes destino (31 ene + 1 mes)', () => {
    const result = resolveMembershipCycle({
      membershipType: 'MONTHLY',
      paymentConfirmedAt: '2026-01-31T00:00:00.000Z',
      currentMembershipStatus: 'NONE',
      currentMembershipEndsAt: null,
    });

    expect(result.endsAt).toBe('2026-02-28T00:00:00.000Z');
  });
});

describe('resolveMembershipCycle — renovación anticipada', () => {
  it.each<MembershipStatus>(['ACTIVE', 'EXPIRING_SOON'])(
    'encadena desde membershipEndsAt vigente cuando membershipStatus=%s (no pierde días pagados)',
    (status) => {
      const result = resolveMembershipCycle({
        membershipType: 'MONTHLY',
        paymentConfirmedAt: '2026-08-09T15:00:00.000Z',
        currentMembershipStatus: status,
        currentMembershipEndsAt: '2026-08-20T00:00:00.000Z',
      });

      expect(result.kind).toBe('EARLY_RENEWAL');
      expect(result.startedAt).toBe('2026-08-20T00:00:00.000Z');
      expect(result.endsAt).toBe('2026-09-20T00:00:00.000Z');
    },
  );

  it('anual: encadena un año desde la vigencia previa, no desde la fecha de pago', () => {
    const result = resolveMembershipCycle({
      membershipType: 'ANNUAL',
      paymentConfirmedAt: '2026-08-09T15:00:00.000Z',
      currentMembershipStatus: 'EXPIRING_SOON',
      currentMembershipEndsAt: '2026-08-20T00:00:00.000Z',
    });

    expect(result.startedAt).toBe('2026-08-20T00:00:00.000Z');
    expect(result.endsAt).toBe('2027-08-20T00:00:00.000Z');
  });
});
