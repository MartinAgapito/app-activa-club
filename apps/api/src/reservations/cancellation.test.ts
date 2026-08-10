import { describe, expect, it } from 'vitest';

import { canCancelReservation } from './cancellation';

describe('canCancelReservation', () => {
  it('permite cancelar con más de 24 horas de anticipación (R-15)', () => {
    const startsAt = '2026-07-20T15:00:00Z';
    const now = new Date('2026-07-19T14:00:00Z'); // 25h antes
    expect(canCancelReservation(startsAt, now)).toBe(true);
  });

  it('borde exacto: permite cancelar cuando faltan exactamente 24 horas (US-033, borde explícito)', () => {
    const startsAt = '2026-07-20T15:00:00Z';
    const now = new Date('2026-07-19T15:00:00Z'); // exactamente 24h antes
    expect(canCancelReservation(startsAt, now)).toBe(true);
  });

  it('rechaza cancelar con menos de 24 horas de anticipación (23h59m, R-16)', () => {
    const startsAt = '2026-07-20T15:00:00Z';
    const now = new Date('2026-07-19T15:01:00Z'); // 23h59m antes
    expect(canCancelReservation(startsAt, now)).toBe(false);
  });

  it('rechaza cancelar un instante después del borde exacto (24h menos 1 segundo)', () => {
    const startsAt = '2026-07-20T15:00:00Z';
    const now = new Date('2026-07-19T15:00:01Z');
    expect(canCancelReservation(startsAt, now)).toBe(false);
  });

  it('rechaza cancelar una reserva ya iniciada o pasada', () => {
    const startsAt = '2026-07-20T15:00:00Z';
    const now = new Date('2026-07-20T16:00:00Z'); // ya empezó
    expect(canCancelReservation(startsAt, now)).toBe(false);
  });

  it('acepta indistintamente string ISO y Date para startsAt', () => {
    const now = new Date('2026-07-19T15:00:00Z');
    expect(canCancelReservation(new Date('2026-07-20T15:00:00Z'), now)).toBe(true);
  });
});
