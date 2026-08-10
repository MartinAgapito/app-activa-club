import { describe, expect, it } from 'vitest';

import { guestMonthlyCounterMonth } from './guest-month';
import { limaWallTimeToUtc } from './time';

describe('guestMonthlyCounterMonth', () => {
  it('devuelve el mes calendario de Lima para una reserva a media tarde', () => {
    expect(guestMonthlyCounterMonth('2026-07-20T15:00:00Z')).toBe('2026-07');
  });

  it('caso de borde de cambio de mes: reserva en la última franja del último día del mes en Lima', () => {
    // parrilla-1 el último día de julio, franja de las 20:00 Lima (último
    // bloque posible antes del cierre a las 22:00): sigue siendo julio en
    // Lima aunque el instante UTC ya sea 01:00 del 1 de agosto.
    const startsAt = limaWallTimeToUtc('2026-07-31', '20:00').toISOString();
    expect(startsAt).toBe('2026-08-01T01:00:00.000Z'); // cruza el día UTC
    expect(guestMonthlyCounterMonth(startsAt)).toBe('2026-07'); // sigue en julio de Lima
  });

  it('una reserva ya en la primera franja del mes siguiente cuenta para el mes nuevo', () => {
    const startsAt = limaWallTimeToUtc('2026-08-01', '06:00').toISOString();
    expect(guestMonthlyCounterMonth(startsAt)).toBe('2026-08');
  });

  it('caso de borde de cambio de año', () => {
    const startsAt = limaWallTimeToUtc('2026-12-31', '20:00').toISOString();
    expect(guestMonthlyCounterMonth(startsAt)).toBe('2026-12');

    const nextYearStartsAt = limaWallTimeToUtc('2027-01-01', '06:00').toISOString();
    expect(guestMonthlyCounterMonth(nextYearStartsAt)).toBe('2027-01');
  });
});
