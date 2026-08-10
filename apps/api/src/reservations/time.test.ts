import { describe, expect, it } from 'vitest';

import { limaCalendarDate, limaMonthKey, limaWallTimeToUtc } from './time';

describe('limaWallTimeToUtc', () => {
  it('convierte el opensAt de fútbol (06:00 Lima) al UTC del ejemplo del contrato (§6)', () => {
    // docs/api/contratos-api.md §6: primer slot de futbol-1 el 2026-07-12
    // empieza en "2026-07-12T11:00:00Z" -> 06:00 Lima + 5h = 11:00 UTC.
    expect(limaWallTimeToUtc('2026-07-12', '06:00').toISOString()).toBe('2026-07-12T11:00:00.000Z');
  });

  it('convierte la medianoche de Lima (00:00) al UTC del mismo día calendario de Lima', () => {
    // 2026-07-12T00:00 Lima = 2026-07-12T05:00Z (no retrocede al día UTC anterior).
    expect(limaWallTimeToUtc('2026-07-12', '00:00').toISOString()).toBe('2026-07-12T05:00:00.000Z');
  });

  it('caso de borde de cambio de día: una hora local tarde cruza al día UTC siguiente', () => {
    // closesAt típico de parrilla/salón (22:00 Lima) cae en el día UTC
    // siguiente porque Lima está detrás de UTC (UTC-5).
    expect(limaWallTimeToUtc('2026-07-12', '22:00').toISOString()).toBe('2026-07-13T03:00:00.000Z');
  });

  it('convierte correctamente en un cambio de mes (31 de enero, último bloque del día)', () => {
    expect(limaWallTimeToUtc('2026-01-31', '22:00').toISOString()).toBe('2026-02-01T03:00:00.000Z');
  });

  it('convierte correctamente en un cambio de año (31 de diciembre)', () => {
    expect(limaWallTimeToUtc('2026-12-31', '22:00').toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });

  it('lanza RangeError si la fecha u hora tienen formato inválido', () => {
    expect(() => limaWallTimeToUtc('2026-13-40', '99:99')).toThrow(RangeError);
  });
});

describe('limaCalendarDate', () => {
  it('reproduce el caso ya cubierto por limaDateOnly en migration/transform.ts (mismo criterio UTC-5)', () => {
    expect(limaCalendarDate(new Date('2026-07-09T12:00:00Z'))).toBe('2026-07-09');
    expect(limaCalendarDate(new Date('2026-07-10T02:00:00Z'))).toBe('2026-07-09');
  });

  it('un instante UTC poco después de la medianoche de Lima ya pertenece al día siguiente de Lima', () => {
    // 2026-07-12T05:00Z = 2026-07-12T00:00 Lima.
    expect(limaCalendarDate(new Date('2026-07-12T05:00:00Z'))).toBe('2026-07-12');
    // Un minuto antes todavía es el día anterior en Lima.
    expect(limaCalendarDate(new Date('2026-07-12T04:59:00Z'))).toBe('2026-07-11');
  });
});

describe('limaMonthKey', () => {
  it('devuelve YYYY-MM en zona América/Lima', () => {
    expect(limaMonthKey(new Date('2026-07-09T12:00:00Z'))).toBe('2026-07');
  });

  it('caso de borde de cambio de mes: un minuto antes de la medianoche de Lima del último día del mes', () => {
    // 2026-08-01T04:59Z = 2026-07-31T23:59 Lima -> todavía julio.
    expect(limaMonthKey(new Date('2026-08-01T04:59:00Z'))).toBe('2026-07');
    // 2026-08-01T05:00Z = 2026-08-01T00:00 Lima -> ya agosto.
    expect(limaMonthKey(new Date('2026-08-01T05:00:00Z'))).toBe('2026-08');
  });

  it('caso de borde de cambio de año', () => {
    expect(limaMonthKey(new Date('2027-01-01T04:59:00Z'))).toBe('2026-12');
    expect(limaMonthKey(new Date('2027-01-01T05:00:00Z'))).toBe('2027-01');
  });
});
