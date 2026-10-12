// Paso del asistente donde se corrige cada error del servidor (US-072,
// criterio 10) y utilidades del selector de días.

import { describe, expect, it } from 'vitest';
import { reservationErrorTarget } from './reservation-errors';
import { addDaysToDate } from '../lib/format/lima-time';

describe('reservationErrorTarget', () => {
  it.each([
    ['RESERVATION_OVERLAP', 'SLOT'],
    ['RESOURCE_IN_MAINTENANCE', 'SLOT'],
    ['OUTSIDE_SCHEDULE', 'SLOT'],
    ['CAPACITY_EXCEEDED', 'PARTICIPANTS'],
    ['PARTICIPANT_OVERLAP', 'PARTICIPANTS'],
    ['GUEST_MONTHLY_LIMIT', 'PARTICIPANTS'],
    ['MEMBER_HAS_DEBT', 'CONFIRM'],
    ['MEMBERSHIP_REQUIRED', 'CONFIRM'],
    ['NETWORK_ERROR', 'CONFIRM'],
    ['INTERNAL_ERROR', 'CONFIRM'],
  ] as const)('%s se corrige en %s', (code, target) => {
    expect(reservationErrorTarget(code)).toBe(target);
  });
});

describe('addDaysToDate', () => {
  it('suma días cruzando fin de mes y de año sin depender de la zona del navegador', () => {
    expect(addDaysToDate('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDate('2026-08-12', 0)).toBe('2026-08-12');
  });
});
