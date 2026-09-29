import { beforeEach, describe, expect, it, vi } from 'vitest';

const getReservationDetailMock = vi.fn();
vi.mock('../../reservations/get-by-id', () => ({
  getReservationDetail: getReservationDetailMock,
}));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./get-by-id');

function buildEvent(reservationId: string | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: `/reservations/${reservationId ?? ''}`,
    pathParameters: reservationId ? { reservationId } : null,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /reservations/{reservationId}', () => {
  beforeEach(() => {
    getReservationDetailMock.mockReset();
  });

  it('devuelve 400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(400);
    expect(getReservationDetailMock).not.toHaveBeenCalled();
  });

  it('devuelve 401 si no hay identidad autenticada', async () => {
    const result = await handler(buildEvent('res-1', {}));
    expect(result.statusCode).toBe(401);
  });

  it('member: llama al orquestador con su cognitoSub y roles', async () => {
    getReservationDetailMock.mockResolvedValue({ reservationId: 'res-1', participants: [] });

    const result = await handler(buildEvent('res-1'));

    expect(result.statusCode).toBe(200);
    expect(getReservationDetailMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      roles: ['member'],
      reservationId: 'res-1',
    });
  });

  it('admin: también autorizado, se propaga el rol admin al orquestador', async () => {
    getReservationDetailMock.mockResolvedValue({ reservationId: 'res-1', participants: [] });

    const result = await handler(
      buildEvent('res-1', { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
    );

    expect(result.statusCode).toBe(200);
    expect(getReservationDetailMock).toHaveBeenCalledWith({
      cognitoSub: 'admin-sub',
      roles: ['admin'],
      reservationId: 'res-1',
    });
  });

  it('propaga el 404 del orquestador (criterio 4: reserva ajena o inexistente)', async () => {
    getReservationDetailMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró la reserva indicada.'),
    );

    const result = await handler(buildEvent('res-ajena'));

    expect(result.statusCode).toBe(404);
  });
});
