import { beforeEach, describe, expect, it, vi } from 'vitest';

const approveReservationMock = vi.fn();
vi.mock('../../reservations/approve', () => ({ approveReservation: approveReservationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./approve');

function buildEvent(reservationId: string | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: `/reservations/${reservationId ?? ''}/approve`,
    pathParameters: reservationId ? { reservationId } : null,
    body: null,
    claims: claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('POST /reservations/{reservationId}/approve', () => {
  beforeEach(() => {
    approveReservationMock.mockReset();
  });

  it('devuelve 400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(400);
    expect(approveReservationMock).not.toHaveBeenCalled();
  });

  it('criterio 7: un member recibe 403 FORBIDDEN', async () => {
    const result = await handler(
      buildEvent('res-1', { sub: 'member-sub', 'cognito:groups': '[member]' }),
    );

    expect(result.statusCode).toBe(403);
    expect(approveReservationMock).not.toHaveBeenCalled();
  });

  it('admin: aprueba y responde 200 con el estado nuevo (criterio 2)', async () => {
    approveReservationMock.mockResolvedValue({
      reservationId: 'res-1',
      reservationStatus: 'APPROVED',
    });

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { reservationId: string; reservationStatus: string };
    expect(body).toEqual({ reservationId: 'res-1', reservationStatus: 'APPROVED' });
    expect(approveReservationMock).toHaveBeenCalledWith({
      reservationId: 'res-1',
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
    });
  });

  it('criterio 5: propaga 409 RESERVATION_NOT_PENDING del orquestador', async () => {
    approveReservationMock.mockRejectedValue(
      new AppError('RESERVATION_NOT_PENDING', 'La reserva no está pendiente de aprobación.'),
    );

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(409);
  });

  it('propaga 404 NOT_FOUND del orquestador', async () => {
    approveReservationMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró la reserva indicada.'),
    );

    const result = await handler(buildEvent('res-x'));

    expect(result.statusCode).toBe(404);
  });
});
