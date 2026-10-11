import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  approveReservation,
  endOfDayInLimaUtcIso,
  listAdminReservations,
  rejectReservation,
  startOfDayInLimaUtcIso,
} from './admin-reservations-client';

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock('../../lib/api/http-client', () => ({ apiRequest: apiRequestMock }));

describe('admin-reservations-client', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('arma la consulta scope=all con todos los filtros y el cursor', async () => {
    apiRequestMock.mockResolvedValue({ items: [], nextCursor: null });
    await listAdminReservations({
      status: 'PENDING_APPROVAL',
      resourceId: 'parrilla-1',
      from: '2026-07-01T05:00:00Z',
      to: '2026-08-01T04:59:59Z',
      cursor: 'abc',
    });

    const path = apiRequestMock.mock.calls[0]![0] as string;
    const params = new URLSearchParams(path.split('?')[1]);
    expect(path.startsWith('/reservations?')).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      scope: 'all',
      limit: '20',
      status: 'PENDING_APPROVAL',
      resourceId: 'parrilla-1',
      from: '2026-07-01T05:00:00Z',
      to: '2026-08-01T04:59:59Z',
      cursor: 'abc',
    });
  });

  it('omite los filtros no informados', async () => {
    apiRequestMock.mockResolvedValue({ items: [], nextCursor: null });
    await listAdminReservations({ status: 'CONFIRMED' });

    const path = apiRequestMock.mock.calls[0]![0] as string;
    expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({
      scope: 'all',
      limit: '20',
      status: 'CONFIRMED',
    });
  });

  it('aprueba y rechaza con los endpoints del contrato', async () => {
    apiRequestMock.mockResolvedValue({});
    await approveReservation('res 1');
    await rejectReservation('res-2', { reason: 'Sin cupo' });

    expect(apiRequestMock).toHaveBeenNthCalledWith(1, '/reservations/res%201/approve', {
      method: 'POST',
    });
    expect(apiRequestMock).toHaveBeenNthCalledWith(2, '/reservations/res-2/reject', {
      method: 'POST',
      body: { reason: 'Sin cupo' },
    });
  });

  it('convierte días de Lima a instantes UTC', () => {
    expect(startOfDayInLimaUtcIso('2026-07-01')).toBe('2026-07-01T05:00:00Z');
    expect(endOfDayInLimaUtcIso('2026-07-31')).toBe('2026-08-01T04:59:59Z');
  });
});
