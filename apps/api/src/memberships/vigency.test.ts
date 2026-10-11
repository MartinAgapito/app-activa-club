import { describe, expect, it } from 'vitest';

import {
  EXPIRING_SOON_THRESHOLD_DAYS,
  addDaysToDateOnly,
  classifyVigency,
  deriveMembershipStatus,
  hasMembershipEnded,
  limaDateOnly,
  resolveVigencyTransition,
  toLimaDate,
} from './vigency';

const TODAY = '2026-07-10';

describe('limaDateOnly / toLimaDate', () => {
  it('resuelve la fecha de Lima de un instante UTC (UTC-5)', () => {
    expect(limaDateOnly(new Date('2026-07-10T03:00:00Z'))).toBe('2026-07-09');
    expect(limaDateOnly(new Date('2026-07-10T05:00:00Z'))).toBe('2026-07-10');
  });

  it('deja intacta una fecha sin hora y convierte un instante ISO', () => {
    expect(toLimaDate('2026-07-10')).toBe('2026-07-10');
    expect(toLimaDate('2026-07-11T03:00:00.000Z')).toBe('2026-07-10');
  });
});

describe('addDaysToDateOnly', () => {
  it('suma días cruzando fin de mes', () => {
    expect(addDaysToDateOnly('2026-07-30', 3)).toBe('2026-08-02');
  });
});

describe('classifyVigency (bordes del umbral de 7 días)', () => {
  it('umbral definido en un único lugar: 7 días', () => {
    expect(EXPIRING_SOON_THRESHOLD_DAYS).toBe(7);
  });

  it.each([
    ['venció ayer', '2026-07-09', 'EXPIRED'],
    ['vence hoy', '2026-07-10', 'EXPIRING_SOON'],
    ['vence en 7 días (inclusive)', '2026-07-17', 'EXPIRING_SOON'],
    ['vence en 8 días', '2026-07-18', 'ACTIVE'],
  ] as const)('%s -> %s', (_label, endsAt, expected) => {
    expect(classifyVigency(endsAt, TODAY)).toBe(expected);
  });

  it('usa la fecha de Lima de un instante UTC', () => {
    // 2026-07-11T03:00Z = 2026-07-10 22:00 Lima -> vence hoy, no ayer.
    expect(classifyVigency('2026-07-11T03:00:00.000Z', TODAY)).toBe('EXPIRING_SOON');
    // 2026-07-10T03:00Z = 2026-07-09 22:00 Lima -> venció ayer.
    expect(classifyVigency('2026-07-10T03:00:00.000Z', TODAY)).toBe('EXPIRED');
  });

  it('hasMembershipEnded solo es true si la fecha ya pasó', () => {
    expect(hasMembershipEnded('2026-07-09', TODAY)).toBe(true);
    expect(hasMembershipEnded('2026-07-10', TODAY)).toBe(false);
  });
});

describe('deriveMembershipStatus (migración / activación)', () => {
  it('la deuda gana sobre el vencimiento', () => {
    expect(deriveMembershipStatus('2026-01-01', 5000, TODAY)).toBe('DEBT');
  });

  it('sin deuda: vencida, por vencer o activa según la fecha', () => {
    expect(deriveMembershipStatus('2026-07-09', 0, TODAY)).toBe('EXPIRED');
    expect(deriveMembershipStatus('2026-07-17', 0, TODAY)).toBe('EXPIRING_SOON');
    expect(deriveMembershipStatus('2026-07-18', 0, TODAY)).toBe('ACTIVE');
  });
});

describe('resolveVigencyTransition (US-038, criterios 2-4)', () => {
  const resolve = (
    membershipStatus: Parameters<typeof resolveVigencyTransition>[0]['membershipStatus'],
    membershipEndsAt: string | null,
  ) => resolveVigencyTransition({ membershipStatus, membershipEndsAt, todayLima: TODAY });

  it('ACTIVE vencida ayer -> EXPIRED', () => {
    expect(resolve('ACTIVE', '2026-07-09')).toBe('EXPIRED');
  });

  it('EXPIRING_SOON vencida -> EXPIRED', () => {
    expect(resolve('EXPIRING_SOON', '2026-07-09')).toBe('EXPIRED');
  });

  it('ACTIVE que vence hoy o en 7 días -> EXPIRING_SOON', () => {
    expect(resolve('ACTIVE', '2026-07-10')).toBe('EXPIRING_SOON');
    expect(resolve('ACTIVE', '2026-07-17')).toBe('EXPIRING_SOON');
  });

  it('ACTIVE que vence en 8 días no cambia', () => {
    expect(resolve('ACTIVE', '2026-07-18')).toBeNull();
  });

  it('EXPIRING_SOON todavía vigente no cambia', () => {
    expect(resolve('EXPIRING_SOON', '2026-07-12')).toBeNull();
  });

  it.each(['DEBT', 'NONE', 'EXPIRED'] as const)(
    '%s no se modifica aunque haya vencido',
    (status) => {
      expect(resolve(status, '2026-01-01')).toBeNull();
    },
  );

  it('sin membershipEndsAt no cambia', () => {
    expect(resolve('ACTIVE', null)).toBeNull();
  });
});
