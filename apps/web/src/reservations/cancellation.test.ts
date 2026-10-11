// Borde de 24 horas (RN-RES-10, US-033): misma regla que el backend.

import { describe, expect, it } from 'vitest';
import { getCancelBlock, hasCancellationWindow } from './cancellation';

const STARTS_AT = '2026-07-12T12:00:00Z';

describe('hasCancellationWindow', () => {
  it('permite cancelar con exactamente 24 horas de anticipación', () => {
    expect(hasCancellationWindow(STARTS_AT, new Date('2026-07-11T12:00:00Z'))).toBe(true);
  });

  it('rechaza cuando faltan 23:59 horas', () => {
    expect(hasCancellationWindow(STARTS_AT, new Date('2026-07-11T12:01:00Z'))).toBe(false);
  });

  it('permite con más de 24 horas', () => {
    expect(hasCancellationWindow(STARTS_AT, new Date('2026-07-10T12:00:00Z'))).toBe(true);
  });
});

describe('getCancelBlock', () => {
  const now = new Date('2026-07-10T12:00:00Z');

  it.each(['CONFIRMED', 'PENDING_APPROVAL', 'APPROVED'] as const)(
    'no bloquea una reserva %s con anticipación suficiente',
    (reservationStatus) => {
      expect(getCancelBlock({ reservationStatus, startsAt: STARTS_AT }, now)).toBeNull();
    },
  );

  it('bloquea estados terminales', () => {
    expect(getCancelBlock({ reservationStatus: 'CANCELLED', startsAt: STARTS_AT }, now)).toBe(
      'ALREADY_CANCELLED',
    );
    expect(getCancelBlock({ reservationStatus: 'REJECTED', startsAt: STARTS_AT }, now)).toBe(
      'REJECTED',
    );
  });

  it('distingue "faltan menos de 24 horas" de "ya comenzó"', () => {
    const soon = new Date('2026-07-12T00:00:00Z');
    expect(getCancelBlock({ reservationStatus: 'CONFIRMED', startsAt: STARTS_AT }, soon)).toBe(
      'TOO_LATE',
    );
    const started = new Date('2026-07-12T12:30:00Z');
    expect(getCancelBlock({ reservationStatus: 'CONFIRMED', startsAt: STARTS_AT }, started)).toBe(
      'STARTED',
    );
  });
});
