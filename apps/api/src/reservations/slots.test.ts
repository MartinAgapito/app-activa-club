import { describe, expect, it } from 'vitest';

import { generateResourceSlots, isSlotAvailable, isSlotPast, resolveSlotStatus } from './slots';

describe('generateResourceSlots', () => {
  it('reproduce el primer slot del ejemplo del contrato para fútbol (§6)', () => {
    const slots = generateResourceSlots(
      { opensAt: '06:00', closesAt: '22:00', blockMinutes: 90 },
      '2026-07-12',
    );
    expect(slots[0]).toEqual({
      startsAt: '2026-07-12T11:00:00.000Z',
      endsAt: '2026-07-12T12:30:00.000Z',
    });
  });

  it('la primera franja empieza en opensAt y la duración de cada franja es exactamente blockMinutes (US-029, criterios 2/3)', () => {
    const slots = generateResourceSlots(
      { opensAt: '06:00', closesAt: '22:00', blockMinutes: 90 },
      '2026-07-12',
    );
    expect(slots[0]?.startsAt).toBe('2026-07-12T11:00:00.000Z');
    for (const slot of slots) {
      const durationMs = new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime();
      expect(durationMs).toBe(90 * 60_000);
    }
  });

  it('una franja que no cabe completa antes de closesAt no se ofrece (fútbol 06:00-22:00 / 90 min -> 10 franjas, no 10.67)', () => {
    const slots = generateResourceSlots(
      { opensAt: '06:00', closesAt: '22:00', blockMinutes: 90 },
      '2026-07-12',
    );
    expect(slots).toHaveLength(10);
    const last = slots[slots.length - 1];
    // La última franja termina a las 21:00 Lima (= 02:00 UTC del día
    // siguiente), no llega a las 22:00 de cierre: el resto del día no alcanza
    // para una franja completa más y por eso no se ofrece.
    expect(last?.endsAt).toBe('2026-07-13T02:00:00.000Z');
  });

  it('salón social (10:00-22:00 / 240 min) llena el día exacto en 3 franjas', () => {
    const slots = generateResourceSlots(
      { opensAt: '10:00', closesAt: '22:00', blockMinutes: 240 },
      '2026-07-12',
    );
    expect(slots).toHaveLength(3);
    expect(slots[0]?.startsAt).toBe('2026-07-12T15:00:00.000Z'); // 10:00 Lima
    expect(slots[slots.length - 1]?.endsAt).toBe('2026-07-13T03:00:00.000Z'); // 22:00 Lima, cambio de día UTC
  });

  it('piscina (08:00-20:00 / 120 min) llena el día exacto en 6 franjas', () => {
    const slots = generateResourceSlots(
      { opensAt: '08:00', closesAt: '20:00', blockMinutes: 120 },
      '2026-07-12',
    );
    expect(slots).toHaveLength(6);
  });

  it('parrilla (10:00-22:00 / 300 min) deja resto sin franja: 2, no 2.4', () => {
    const slots = generateResourceSlots(
      { opensAt: '10:00', closesAt: '22:00', blockMinutes: 300 },
      '2026-07-12',
    );
    expect(slots).toHaveLength(2);
    // 10:00 + 2*5h = 20:00 Lima; un tercer bloque terminaría a la 01:00 Lima
    // del día siguiente, después del cierre (22:00), así que no se ofrece.
    expect(slots[slots.length - 1]?.endsAt).toBe('2026-07-13T01:00:00.000Z');
  });

  it('lanza RangeError si closesAt no es posterior a opensAt', () => {
    expect(() =>
      generateResourceSlots(
        { opensAt: '20:00', closesAt: '10:00', blockMinutes: 60 },
        '2026-07-12',
      ),
    ).toThrow(RangeError);
  });

  it('lanza RangeError si blockMinutes no es un entero positivo', () => {
    expect(() =>
      generateResourceSlots({ opensAt: '06:00', closesAt: '22:00', blockMinutes: 0 }, '2026-07-12'),
    ).toThrow(RangeError);
  });
});

describe('isSlotPast', () => {
  it('una franja cuyo inicio ya pasó es PAST', () => {
    expect(isSlotPast('2026-07-12T11:00:00Z', new Date('2026-07-12T11:30:00Z'))).toBe(true);
  });

  it('una franja cuyo inicio todavía no llega no es PAST', () => {
    expect(isSlotPast('2026-07-12T11:00:00Z', new Date('2026-07-12T10:30:00Z'))).toBe(false);
  });

  it('una franja cuyo inicio coincide exactamente con "now" todavía no se considera pasada (borde estricto)', () => {
    expect(isSlotPast('2026-07-12T11:00:00Z', new Date('2026-07-12T11:00:00Z'))).toBe(false);
  });
});

describe('resolveSlotStatus', () => {
  it('sin ningún motivo -> AVAILABLE', () => {
    expect(resolveSlotStatus({ isPast: false, isMaintenance: false, isReserved: false })).toBe(
      'AVAILABLE',
    );
  });

  it('solo reservada -> RESERVED', () => {
    expect(resolveSlotStatus({ isPast: false, isMaintenance: false, isReserved: true })).toBe(
      'RESERVED',
    );
  });

  it('solo en mantenimiento -> MAINTENANCE', () => {
    expect(resolveSlotStatus({ isPast: false, isMaintenance: true, isReserved: false })).toBe(
      'MAINTENANCE',
    );
  });

  it('mantenimiento y reservada a la vez -> MAINTENANCE gana sobre RESERVED (US-029, precedencia)', () => {
    expect(resolveSlotStatus({ isPast: false, isMaintenance: true, isReserved: true })).toBe(
      'MAINTENANCE',
    );
  });

  it('pasada, en mantenimiento y reservada a la vez -> PAST gana sobre todo', () => {
    expect(resolveSlotStatus({ isPast: true, isMaintenance: true, isReserved: true })).toBe('PAST');
  });

  it('pasada y reservada (sin mantenimiento) -> PAST gana sobre RESERVED', () => {
    expect(resolveSlotStatus({ isPast: true, isMaintenance: false, isReserved: true })).toBe(
      'PAST',
    );
  });
});

describe('isSlotAvailable', () => {
  it('es true exactamente cuando status === AVAILABLE (contrato §6: "available" es el campo de decisión)', () => {
    expect(isSlotAvailable('AVAILABLE')).toBe(true);
    expect(isSlotAvailable('RESERVED')).toBe(false);
    expect(isSlotAvailable('MAINTENANCE')).toBe(false);
    expect(isSlotAvailable('PAST')).toBe(false);
  });
});
