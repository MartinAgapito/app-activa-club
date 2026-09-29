import { beforeEach, describe, expect, it, vi } from 'vitest';

const getResourceAvailabilityMock = vi.fn();
vi.mock('../../reservations/availability', () => ({
  getResourceAvailability: getResourceAvailabilityMock,
}));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./availability');

const sampleResponse = {
  resourceId: 'futbol-1',
  date: '2026-07-12',
  blockMinutes: 90,
  resourceStatus: 'AVAILABLE',
  slots: [
    {
      startsAt: '2026-07-12T11:00:00.000Z',
      endsAt: '2026-07-12T12:30:00.000Z',
      available: true,
      status: 'AVAILABLE',
    },
  ],
};

function buildEvent(
  overrides: {
    pathParameters?: Record<string, string> | null;
    queryStringParameters?: Record<string, string> | null;
    claims?: Record<string, string>;
  } = {},
) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/resources/futbol-1/availability',
    pathParameters: overrides.pathParameters ?? { resourceId: 'futbol-1' },
    queryStringParameters: overrides.queryStringParameters ?? { date: '2026-07-12' },
    claims: overrides.claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /resources/{resourceId}/availability', () => {
  beforeEach(() => {
    getResourceAvailabilityMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member (criterio 10, admin no consulta disponibilidad puntual)', async () => {
    const event = buildEvent({ claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' } });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(getResourceAvailabilityMock).not.toHaveBeenCalled();
  });

  it('devuelve 401 (vía extractIdentity) si no hay identidad autenticada', async () => {
    const event = buildEvent();
    // Simula un evento sin claims (no debería ocurrir tras el Cognito
    // Authorizer, pero el handler debe seguir siendo defensivo).
    (event.requestContext.authorizer as { claims?: unknown }).claims = undefined;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(getResourceAvailabilityMock).not.toHaveBeenCalled();
  });

  it('llama al orquestador con resourceId (ruta) y date (query), y responde 200 con el contrato completo (criterio 1)', async () => {
    getResourceAvailabilityMock.mockResolvedValue(sampleResponse);

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(sampleResponse);
    expect(getResourceAvailabilityMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      date: '2026-07-12',
    });
  });

  it('devuelve 400 VALIDATION_ERROR si falta resourceId en la ruta, sin invocar el orquestador', async () => {
    const result = await handler(buildEvent({ pathParameters: {} }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(getResourceAvailabilityMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si falta date en el query, sin invocar el orquestador', async () => {
    const result = await handler(buildEvent({ queryStringParameters: {} }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(getResourceAvailabilityMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si date no cumple el formato YYYY-MM-DD, sin invocar el orquestador (criterio 9)', async () => {
    const result = await handler(buildEvent({ queryStringParameters: { date: '12-07-2026' } }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(getResourceAvailabilityMock).not.toHaveBeenCalled();
  });

  it('propaga 404 NOT_FOUND desde el orquestador cuando el recurso no existe (criterio 9)', async () => {
    getResourceAvailabilityMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el recurso solicitado.'),
    );

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
