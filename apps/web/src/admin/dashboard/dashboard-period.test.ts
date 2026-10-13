import { describe, expect, it } from 'vitest';
import { formatPeriodRange } from './dashboard-period';

describe('formatPeriodRange', () => {
  it('muestra el mes en curso en hora de Lima, con el último día incluido', () => {
    expect(
      formatPeriodRange({
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-11-01T05:00:00.000Z',
        timeZone: 'America/Lima',
      }),
    ).toBe('1 al 31 de octubre de 2026');
  });

  it('una ventana que cruza de mes nombra ambos meses', () => {
    expect(
      formatPeriodRange({
        from: '2026-10-20T05:00:00.000Z',
        to: '2026-11-19T05:00:00.000Z',
        timeZone: 'America/Lima',
      }),
    ).toBe('20 de octubre de 2026 al 18 de noviembre de 2026');
  });
});
