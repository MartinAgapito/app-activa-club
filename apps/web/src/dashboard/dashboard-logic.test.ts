import { describe, expect, it } from 'vitest';
import type { Reservation } from '@activa-club/shared-types';
import { summarizeMembership, daysLabel } from './membership-summary';
import { selectUpcoming } from './upcoming-reservations';
import { daysUntilInLima } from '../lib/format/lima-time';

const NOW = new Date('2026-10-11T15:00:00Z');

describe('summarizeMembership', () => {
  const base = { membershipStatus: 'ACTIVE', outstandingBalance: 0 } as const;

  it('al día lejos del vencimiento: sin acción', () => {
    const s = summarizeMembership({ ...base, membershipEndsAt: '2026-12-01T05:00:00Z' }, NOW);
    expect(s.action).toBeNull();
  });

  it('activa con 7 días o menos: renovar', () => {
    const s = summarizeMembership({ ...base, membershipEndsAt: '2026-10-18T05:00:00Z' }, NOW);
    expect(s).toMatchObject({ daysLeft: 7, action: 'RENEW' });
  });

  it('deuda o saldo: pagar', () => {
    expect(
      summarizeMembership({ ...base, outstandingBalance: 100, membershipEndsAt: null }, NOW).action,
    ).toBe('PAY');
    expect(
      summarizeMembership({ ...base, membershipStatus: 'DEBT', membershipEndsAt: null }, NOW)
        .action,
    ).toBe('PAY');
  });

  it('vencida: renovar', () => {
    expect(
      summarizeMembership(
        { ...base, membershipStatus: 'EXPIRED', membershipEndsAt: '2026-10-01T05:00:00Z' },
        NOW,
      ).action,
    ).toBe('RENEW');
  });
});

describe('daysUntilInLima / daysLabel', () => {
  it('cuenta días de calendario de Lima', () => {
    // 02:00Z del día 12 sigue siendo el 11 en Lima (UTC-5).
    expect(daysUntilInLima('2026-10-12T02:00:00Z', NOW)).toBe(0);
    expect(daysUntilInLima('2026-10-13T05:00:00Z', NOW)).toBe(2);
  });
  it('etiqueta singular y hoy', () => {
    expect(daysLabel(0)).toBe('Vence hoy');
    expect(daysLabel(1)).toBe('Vence mañana');
    expect(daysLabel(5)).toBe('Vence en 5 días');
  });
});

describe('selectUpcoming', () => {
  const r = (id: string, startsAt: string, status: Reservation['reservationStatus']) =>
    ({
      reservationId: id,
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
      reservationStatus: status,
    }) as Reservation;

  it('descarta canceladas, rechazadas y ya terminadas; máximo 3 ordenadas', () => {
    const result = selectUpcoming(
      [
        r('a', '2026-10-20T10:00:00Z', 'CONFIRMED'),
        r('b', '2026-10-12T10:00:00Z', 'CANCELLED'),
        r('c', '2026-10-13T10:00:00Z', 'REJECTED'),
        r('d', '2026-10-10T10:00:00Z', 'CONFIRMED'),
        r('e', '2026-10-14T10:00:00Z', 'PENDING_APPROVAL'),
        r('f', '2026-10-15T10:00:00Z', 'APPROVED'),
        r('g', '2026-10-16T10:00:00Z', 'CONFIRMED'),
      ],
      NOW,
    );
    expect(result.map((x) => x.reservationId)).toEqual(['e', 'f', 'g']);
  });
});
