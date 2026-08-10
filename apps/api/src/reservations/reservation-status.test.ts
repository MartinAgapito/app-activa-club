import { describe, expect, it } from 'vitest';
import type { ReservationStatus } from '@activa-club/shared-types';

import { ACTIVE_RESERVATION_STATUSES, isActiveReservationStatus } from './reservation-status';

describe('isActiveReservationStatus', () => {
  it.each<ReservationStatus>(['CONFIRMED', 'PENDING_APPROVAL', 'APPROVED'])(
    '%s bloquea (ocupa franja / superposición / cupo de invitado)',
    (status) => {
      expect(isActiveReservationStatus(status)).toBe(true);
    },
  );

  it.each<ReservationStatus>(['CANCELLED', 'REJECTED'])('%s no bloquea', (status) => {
    expect(isActiveReservationStatus(status)).toBe(false);
  });

  it('ACTIVE_RESERVATION_STATUSES contiene exactamente los tres estados activos, ni uno más', () => {
    expect([...ACTIVE_RESERVATION_STATUSES].sort()).toEqual(
      ['APPROVED', 'CONFIRMED', 'PENDING_APPROVAL'].sort(),
    );
  });
});
