import { describe, expect, it } from 'vitest';

import { notImplementedCulqiClient } from './culqi-client';

describe('notImplementedCulqiClient', () => {
  it('lanza INTERNAL_ERROR en vez de simular un resultado de cargo (stub sin integración real)', async () => {
    await expect(
      notImplementedCulqiClient({
        culqiToken: 'tkn_test_xxx',
        amount: 12_000,
        currency: 'PEN',
        reference: 'payment-1',
      }),
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
});
