import { describe, expect, it } from 'vitest';
import type { MemberStatus } from '@activa-club/shared-types';

import { assertMemberCanPay } from './eligibility';

describe('assertMemberCanPay', () => {
  it.each<MemberStatus>(['APPROVED', 'ACTIVE'])(
    'no lanza para memberStatus=%s (primer pago / renovación-regularización)',
    (status) => {
      expect(() => assertMemberCanPay(status)).not.toThrow();
    },
  );

  it.each<MemberStatus>(['PENDING', 'REJECTED', 'MIGRATED'])(
    'lanza MEMBER_NOT_APPROVED (403) para memberStatus=%s (criterio 7)',
    (status) => {
      expect(() => assertMemberCanPay(status)).toThrow(
        expect.objectContaining({ code: 'MEMBER_NOT_APPROVED' }),
      );
    },
  );
});
