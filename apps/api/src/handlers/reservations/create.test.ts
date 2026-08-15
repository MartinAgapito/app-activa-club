import { beforeEach, describe, expect, it, vi } from 'vitest';

const createReservationMock = vi.fn();
vi.mock('../../reservations/create', () => ({ createReservation: createReservationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./create');

const validBody = {
  resourceId: 'futbol-1',
  startsAt: '2026-07-12T11:00:00.000Z',
  participants: [],
};

function buildEvent(body: unknown, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: '/reservations',
    body: JSON.stringify(body),
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('POST /reservations', () => {
  beforeEach(() => {
    createReservationMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member (el titular siempre es el socio autenticado, RN-RES-06)', async () => {
    const event = buildEvent(validBody, { sub: 'admin-sub', 'cognito:groups': '[admin]' });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it('crea la reserva y responde 201 con el resultado del contrato (criterio 1)', async () => {
    createReservationMock.mockResolvedValue({
      reservationId: '01J000000000000000000RES1',
      resourceId: 'futbol-1',
      reservationStatus: 'CONFIRMED',
      startsAt: '2026-07-12T11:00:00.000Z',
      endsAt: '2026-07-12T12:30:00.000Z',
      participantCount: 1,
      guestCount: 0,
    });

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body) as { reservationId: string; reservationStatus: string };
    expect(body.reservationId).toBe('01J000000000000000000RES1');
    expect(body.reservationStatus).toBe('CONFIRMED');
    expect(createReservationMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      request: validBody,
    });
  });

  it('omite notes del request cuando no se envía (DTO opcional, exactOptionalPropertyTypes)', async () => {
    createReservationMock.mockResolvedValue({
      reservationId: '01J000000000000000000RES2',
      resourceId: 'futbol-1',
      reservationStatus: 'CONFIRMED',
      startsAt: '2026-07-12T11:00:00.000Z',
      endsAt: '2026-07-12T12:30:00.000Z',
      participantCount: 1,
      guestCount: 0,
    });

    await handler(buildEvent(validBody));

    const callArg = createReservationMock.mock.calls[0]?.[0] as {
      request: Record<string, unknown>;
    };
    expect('notes' in callArg.request).toBe(false);
  });

  it('devuelve 400 VALIDATION_ERROR con un resourceId vacío, sin invocar createReservation (criterio 12)', async () => {
    const result = await handler(buildEvent({ ...validBody, resourceId: '' }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/reservations',
      body: null,
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it('propaga 409 RESERVATION_OVERLAP desde createReservation (criterios 7/14)', async () => {
    createReservationMock.mockRejectedValue(
      new AppError('RESERVATION_OVERLAP', 'La franja se cruza con otra reserva activa.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('RESERVATION_OVERLAP');
  });

  it('propaga 422 MEMBERSHIP_REQUIRED desde createReservation (criterio 10)', async () => {
    createReservationMock.mockRejectedValue(
      new AppError('MEMBERSHIP_REQUIRED', 'El socio debe estar activo para reservar.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBERSHIP_REQUIRED');
  });

  it('propaga 422 MEMBER_HAS_DEBT desde createReservation (criterio 11)', async () => {
    createReservationMock.mockRejectedValue(
      new AppError('MEMBER_HAS_DEBT', 'El socio tiene deuda pendiente.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBER_HAS_DEBT');
  });

  it('propaga 404 NOT_FOUND desde createReservation (criterio 12)', async () => {
    createReservationMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el recurso solicitado.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
