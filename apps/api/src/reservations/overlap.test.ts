import { describe, expect, it } from 'vitest';

import { intervalsOverlap } from './overlap';

describe('intervalsOverlap', () => {
  it('detecta solapamiento parcial (B empieza antes de que termine A)', () => {
    expect(
      intervalsOverlap(
        '2026-07-12T11:00:00Z',
        '2026-07-12T12:30:00Z',
        '2026-07-12T12:00:00Z',
        '2026-07-12T13:30:00Z',
      ),
    ).toBe(true);
  });

  it('detecta un intervalo totalmente contenido en el otro', () => {
    expect(
      intervalsOverlap(
        '2026-07-12T11:00:00Z',
        '2026-07-12T15:00:00Z',
        '2026-07-12T12:00:00Z',
        '2026-07-12T13:00:00Z',
      ),
    ).toBe(true);
  });

  it('detecta intervalos idénticos como solapados (RN-RES-07: misma franja exacta)', () => {
    expect(
      intervalsOverlap(
        '2026-07-12T11:00:00Z',
        '2026-07-12T12:30:00Z',
        '2026-07-12T11:00:00Z',
        '2026-07-12T12:30:00Z',
      ),
    ).toBe(true);
  });

  it('no considera solapadas dos franjas consecutivas que solo se tocan en el instante de cambio', () => {
    // 11:00-12:30 seguido de 12:30-14:00: uso intensivo legítimo de una
    // cancha, no debe rechazarse como cruce.
    expect(
      intervalsOverlap(
        '2026-07-12T11:00:00Z',
        '2026-07-12T12:30:00Z',
        '2026-07-12T12:30:00Z',
        '2026-07-12T14:00:00Z',
      ),
    ).toBe(false);
  });

  it('no considera solapadas dos franjas completamente separadas', () => {
    expect(
      intervalsOverlap(
        '2026-07-12T11:00:00Z',
        '2026-07-12T12:30:00Z',
        '2026-07-12T15:00:00Z',
        '2026-07-12T16:30:00Z',
      ),
    ).toBe(false);
  });

  it('es simétrico: overlap(a,b) === overlap(b,a)', () => {
    const a: [string, string] = ['2026-07-12T11:00:00Z', '2026-07-12T12:30:00Z'];
    const b: [string, string] = ['2026-07-12T12:00:00Z', '2026-07-12T13:30:00Z'];
    expect(intervalsOverlap(a[0], a[1], b[0], b[1])).toBe(intervalsOverlap(b[0], b[1], a[0], a[1]));
  });

  it('acepta indistintamente strings ISO y Date', () => {
    const start = new Date('2026-07-12T11:00:00Z');
    const end = new Date('2026-07-12T12:30:00Z');
    expect(intervalsOverlap(start, end, '2026-07-12T12:00:00Z', '2026-07-12T13:00:00Z')).toBe(true);
  });
});
