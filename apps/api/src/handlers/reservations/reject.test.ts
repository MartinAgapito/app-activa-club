import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejectReservationMock = vi.fn();
vi.mock('../../reservations/reject', () => ({ rejectReservation: rejectReservationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./reject');

function buildEvent(
  reservationId: string | null,
  body: string | null,
  claims?: Record<string, string>,
) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: `/reservations/${reservationId ?? ''}/reject`,
    pathParameters: reservationId ? { reservationId } : null,
    body,
    claims: claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('POST /reservations/{reservationId}/reject', () => {
  beforeEach(() => {
    rejectReservationMock.mockReset();
  });

  it('devuelve 400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent(null, JSON.stringify({ reason: 'motivo válido' })));

    expect(result.statusCode).toBe(400);
    expect(rejectReservationMock).not.toHaveBeenCalled();
  });

  it('criterio 7: un member recibe 403 FORBIDDEN', async () => {
    const result = await handler(
      buildEvent('res-1', JSON.stringify({ reason: 'motivo válido' }), {
        sub: 'member-sub',
        'cognito:groups': '[member]',
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(rejectReservationMock).not.toHaveBeenCalled();
  });

  it('criterio 4: sin motivo devuelve 400 VALIDATION_ERROR y no llama al orquestador', async () => {
    const result = await handler(buildEvent('res-1', JSON.stringify({})));

    expect(result.statusCode).toBe(400);
    expect(rejectReservationMock).not.toHaveBeenCalled();
  });

  it('criterio 4: un motivo que no cumple el esquema (muy corto) devuelve 400 VALIDATION_ERROR', async () => {
    const result = await handler(buildEvent('res-1', JSON.stringify({ reason: 'no' })));

    expect(result.statusCode).toBe(400);
    expect(rejectReservationMock).not.toHaveBeenCalled();
  });

  it('admin: rechaza con el motivo y responde 200 con el estado nuevo (criterio 3)', async () => {
    rejectReservationMock.mockResolvedValue({
      reservationId: 'res-1',
      reservationStatus: 'REJECTED',
      rejectionReason: 'Recurso en mantenimiento',
    });

    const result = await handler(
      buildEvent('res-1', JSON.stringify({ reason: 'Recurso en mantenimiento' })),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as {
      reservationId: string;
      reservationStatus: string;
      rejectionReason: string;
    };
    expect(body).toEqual({
      reservationId: 'res-1',
      reservationStatus: 'REJECTED',
      rejectionReason: 'Recurso en mantenimiento',
    });
    expect(rejectReservationMock).toHaveBeenCalledWith({
      reservationId: 'res-1',
      reason: 'Recurso en mantenimiento',
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
    });
  });

  it('criterio 5: propaga 409 RESERVATION_NOT_PENDING del orquestador', async () => {
    rejectReservationMock.mockRejectedValue(
      new AppError('RESERVATION_NOT_PENDING', 'La reserva no está pendiente de aprobación.'),
    );

    const result = await handler(
      buildEvent('res-1', JSON.stringify({ reason: 'Recurso en mantenimiento' })),
    );

    expect(result.statusCode).toBe(409);
  });

  it('propaga 404 NOT_FOUND del orquestador', async () => {
    rejectReservationMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró la reserva indicada.'),
    );

    const result = await handler(
      buildEvent('res-x', JSON.stringify({ reason: 'Recurso en mantenimiento' })),
    );

    expect(result.statusCode).toBe(404);
  });
});
