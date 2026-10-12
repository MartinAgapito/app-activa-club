import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledEvent } from 'aws-lambda';

const notifyRenewalsMock = vi.fn();
vi.mock('../../memberships/notify-renewals', () => ({
  notifyRenewals: notifyRenewalsMock,
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handler } = await import('./notify');

const event = { id: 'evt-456', 'detail-type': 'Scheduled Event' } as unknown as ScheduledEvent;

const okSummary = { evaluated: 3, notified: 2, skipped: 1, duplicates: 0, errors: 0 };

describe('handler del proceso programado de avisos de renovación (US-047)', () => {
  beforeEach(() => {
    notifyRenewalsMock.mockReset();
  });

  it('delega en notifyRenewals con el id del evento y devuelve el resumen', async () => {
    notifyRenewalsMock.mockResolvedValue(okSummary);

    await expect(handler(event)).resolves.toEqual(okSummary);
    expect(notifyRenewalsMock).toHaveBeenCalledWith({ requestId: 'evt-456' });
  });

  it('termina en error (dispara la alarma) si algún rastro falló', async () => {
    notifyRenewalsMock.mockResolvedValue({ ...okSummary, errors: 2 });

    await expect(handler(event)).rejects.toThrow(/2 rastro/);
  });

  it('propaga un fallo total (p. ej. DynamoDB no disponible)', async () => {
    notifyRenewalsMock.mockRejectedValue(new Error('ddb down'));

    await expect(handler(event)).rejects.toThrow('ddb down');
  });
});
