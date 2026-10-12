import { describe, expect, it } from 'vitest';
import { formatDateTimeInLima } from './lima-time';

describe('formatDateTimeInLima', () => {
  it('muestra fecha y hora en America/Lima, no en UTC', () => {
    // 2026-07-09T03:30Z es el 8 de julio 22:30 en Lima.
    const text = formatDateTimeInLima('2026-07-09T03:30:00Z');
    expect(text).toMatch(/8/);
    expect(text).toMatch(/22:30/);
  });
});
