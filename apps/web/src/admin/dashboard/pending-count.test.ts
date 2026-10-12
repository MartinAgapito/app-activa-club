import { describe, expect, it } from 'vitest';
import { describePendingCount, formatPendingCount } from './pending-count';

describe('formatPendingCount', () => {
  it('muestra el número exacto cuando no hay más páginas', () => {
    expect(formatPendingCount({ count: 3, hasMore: false })).toBe('3');
    expect(formatPendingCount({ count: 0, hasMore: false })).toBe('0');
  });

  it('muestra "N o más" cuando hay más páginas, nunca un total inventado', () => {
    expect(formatPendingCount({ count: 20, hasMore: true })).toBe('20 o más');
  });
});

describe('describePendingCount', () => {
  it('usa singular solo para un total exacto de uno', () => {
    expect(describePendingCount({ count: 1, hasMore: false }, 'solicitud', 'solicitudes')).toBe(
      '1 solicitud',
    );
    expect(describePendingCount({ count: 2, hasMore: false }, 'solicitud', 'solicitudes')).toBe(
      '2 solicitudes',
    );
    expect(describePendingCount({ count: 20, hasMore: true }, 'solicitud', 'solicitudes')).toBe(
      '20 o más solicitudes',
    );
  });
});
