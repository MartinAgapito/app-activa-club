import { describe, expect, it } from 'vitest';

import { resolveReservationEndsAt } from './reservation-window';

describe('resolveReservationEndsAt', () => {
  it('reproduce el ejemplo del contrato: parrilla de 300 min desde las 15:00Z (§7)', () => {
    // docs/api/contratos-api.md §7: POST /reservations con
    // startsAt "2026-07-20T15:00:00Z" sobre parrilla-1 (blockMinutes 300)
    // responde endsAt "2026-07-20T20:00:00Z".
    expect(resolveReservationEndsAt('2026-07-20T15:00:00Z', 300)).toBe('2026-07-20T20:00:00.000Z');
  });

  it('suma blockMinutes exactos para fútbol (90 min)', () => {
    expect(resolveReservationEndsAt('2026-07-12T11:00:00Z', 90)).toBe('2026-07-12T12:30:00.000Z');
  });

  it('cruza la medianoche UTC cuando startsAt está cerca del cierre del día', () => {
    expect(resolveReservationEndsAt('2026-07-12T23:00:00Z', 120)).toBe('2026-07-13T01:00:00.000Z');
  });

  it('lanza RangeError si blockMinutes no es un entero positivo', () => {
    expect(() => resolveReservationEndsAt('2026-07-12T11:00:00Z', 0)).toThrow(RangeError);
    expect(() => resolveReservationEndsAt('2026-07-12T11:00:00Z', -5)).toThrow(RangeError);
    expect(() => resolveReservationEndsAt('2026-07-12T11:00:00Z', 90.5)).toThrow(RangeError);
  });

  it('lanza RangeError si startsAt no es una fecha válida', () => {
    expect(() => resolveReservationEndsAt('no-es-una-fecha', 90)).toThrow(RangeError);
  });
});
