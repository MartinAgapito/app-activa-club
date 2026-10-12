import { describe, expect, it } from 'vitest';

import { buildDedupeKey, notificationIdFromDedupeKey } from './dedupe';

describe('dedupe', () => {
  it('la clave combina evento, socio y hecho', () => {
    expect(buildDedupeKey('PAYMENT_SUCCEEDED', 'm1', 'pay1')).toBe('PAYMENT_SUCCEEDED#m1#pay1');
  });

  it('el notificationId es determinista y con forma de ULID', () => {
    const a = notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m1#pay1');
    const b = notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m1#pay1');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  });

  it('claves distintas producen identificadores distintos', () => {
    expect(notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m1#pay1')).not.toBe(
      notificationIdFromDedupeKey('PAYMENT_FAILED#m1#pay1'),
    );
    expect(notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m1#pay1')).not.toBe(
      notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m2#pay1'),
    );
  });
});
