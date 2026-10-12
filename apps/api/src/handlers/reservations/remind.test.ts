import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledEvent } from 'aws-lambda';

const remindReservationsMock = vi.fn();
vi.mock('../../reservations/remind-reservations', () => ({
  remindReservations: remindReservationsMock,
}));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handler } = await import('./remind');

const event = { id: 'evt-456', 'detail-type': 'Scheduled Event' } as unknown as ScheduledEvent;

const okSummary = {
  targetDateLima: '2026-07-11',
  resources: 10,
  evaluated: 3,
  sent: 3,
  duplicated: 0,
  errors: 0,
};

describe('handler del recordatorio de reservas (US-046)', () => {
  beforeEach(() => {
    remindReservationsMock.mockReset();
  });

  it('delega con el id del evento y devuelve el resumen', async () => {
    remindReservationsMock.mockResolvedValue(okSummary);

    await expect(handler(event)).resolves.toEqual(okSummary);
    expect(remindReservationsMock).toHaveBeenCalledWith({ requestId: 'evt-456' });
  });

  it('termina en error (dispara la alarma) si hubo errores parciales', async () => {
    remindReservationsMock.mockResolvedValue({ ...okSummary, errors: 2 });

    await expect(handler(event)).rejects.toThrow(/2 error/);
  });

  it('propaga un fallo total', async () => {
    remindReservationsMock.mockRejectedValue(new Error('ddb down'));

    await expect(handler(event)).rejects.toThrow('ddb down');
  });
});
