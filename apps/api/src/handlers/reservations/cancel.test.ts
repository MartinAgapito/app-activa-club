import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelReservationMock = vi.fn();
vi.mock('../../reservations/cancel', () => ({ cancelReservation: cancelReservationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./cancel');

function buildEvent(reservationId: string | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: `/reservations/${reservationId ?? ''}/cancel`,
    pathParameters: reservationId ? { reservationId } : null,
    body: null,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('POST /reservations/{reservationId}/cancel', () => {
  beforeEach(() => {
    cancelReservationMock.mockReset();
  });

  it('devuelve 400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(400);
    expect(cancelReservationMock).not.toHaveBeenCalled();
  });

  it('un admin recibe 403 (cancelación administrativa es US-036, fuera de esta historia)', async () => {
    const result = await handler(
      buildEvent('res-1', { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
    );

    expect(result.statusCode).toBe(403);
    expect(cancelReservationMock).not.toHaveBeenCalled();
  });

  it('member: cancela sin necesitar cuerpo de solicitud y responde 200 con el resultado del contrato', async () => {
    cancelReservationMock.mockResolvedValue({
      reservationId: 'res-1',
      reservationStatus: 'CANCELLED',
    });

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { reservationId: string; reservationStatus: string };
    expect(body).toEqual({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
    expect(cancelReservationMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      reservationId: 'res-1',
    });
  });

  it('propaga 422 CANCELLATION_TOO_LATE del orquestador (criterio 6)', async () => {
    cancelReservationMock.mockRejectedValue(
      new AppError('CANCELLATION_TOO_LATE', 'Solo se puede cancelar hasta 24 horas antes.'),
    );

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(422);
  });

  it('propaga 409 CONFLICT del orquestador (criterio 8)', async () => {
    cancelReservationMock.mockRejectedValue(
      new AppError('CONFLICT', 'La reserva ya no está activa.'),
    );

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(409);
  });

  it('propaga 404 NOT_FOUND del orquestador (criterio 9: reserva ajena o inexistente)', async () => {
    cancelReservationMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró la reserva indicada.'),
    );

    const result = await handler(buildEvent('res-ajena'));

    expect(result.statusCode).toBe(404);
  });
});
