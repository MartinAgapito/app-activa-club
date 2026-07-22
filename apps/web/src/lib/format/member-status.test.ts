import { describe, expect, it } from 'vitest';
import type { MemberStatus, MembershipStatus } from '@activa-club/shared-types';
import {
  MEMBER_STATUS_BADGE_VARIANT,
  MEMBER_STATUS_LABELS,
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from './member-status';

const MEMBER_STATUSES: MemberStatus[] = ['MIGRATED', 'PENDING', 'APPROVED', 'REJECTED', 'ACTIVE'];
const MEMBERSHIP_STATUSES: MembershipStatus[] = [
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'DEBT',
  'NONE',
];

describe('member-status', () => {
  it('traduce cada MemberStatus a un texto en español distinto del código crudo', () => {
    MEMBER_STATUSES.forEach((status) => {
      expect(MEMBER_STATUS_LABELS[status]).toBeTruthy();
      expect(MEMBER_STATUS_LABELS[status]).not.toBe(status);
      expect(MEMBER_STATUS_BADGE_VARIANT[status]).toBeTruthy();
    });
  });

  it('traduce cada MembershipStatus a un texto en español distinto del código crudo', () => {
    MEMBERSHIP_STATUSES.forEach((status) => {
      expect(MEMBERSHIP_STATUS_LABELS[status]).toBeTruthy();
      expect(MEMBERSHIP_STATUS_LABELS[status]).not.toBe(status);
      expect(MEMBERSHIP_STATUS_BADGE_VARIANT[status]).toBeTruthy();
    });
  });

  it('marca la deuda y el vencimiento con la variante de peligro (dirige a regularizar en pagos)', () => {
    expect(MEMBERSHIP_STATUS_BADGE_VARIANT.DEBT).toBe('danger');
    expect(MEMBERSHIP_STATUS_BADGE_VARIANT.EXPIRED).toBe('danger');
  });
});
