import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledEvent } from 'aws-lambda';

const expireMembershipsMock = vi.fn();
vi.mock('../../memberships/expire-memberships', () => ({
  expireMemberships: expireMembershipsMock,
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handler } = await import('./expire');

const event = { id: 'evt-123', 'detail-type': 'Scheduled Event' } as unknown as ScheduledEvent;

const okSummary = {
  todayLima: '2026-07-10',
  evaluated: 3,
  toExpiringSoon: 1,
  toExpired: 1,
  skippedConcurrent: 0,
  supersededCleaned: 0,
  errors: 0,
};

describe('handler del proceso programado de vencimiento (US-038)', () => {
  beforeEach(() => {
    expireMembershipsMock.mockReset();
  });

  it('delega en expireMemberships con el id del evento y devuelve el resumen', async () => {
    expireMembershipsMock.mockResolvedValue(okSummary);

    await expect(handler(event)).resolves.toEqual(okSummary);
    expect(expireMembershipsMock).toHaveBeenCalledWith({ requestId: 'evt-123' });
  });

  it('termina en error (dispara la alarma) si algún socio falló', async () => {
    expireMembershipsMock.mockResolvedValue({ ...okSummary, errors: 2 });

    await expect(handler(event)).rejects.toThrow(/2 socio/);
  });

  it('propaga un fallo total (p. ej. DynamoDB no disponible)', async () => {
    expireMembershipsMock.mockRejectedValue(new Error('ddb down'));

    await expect(handler(event)).rejects.toThrow('ddb down');
  });
});
