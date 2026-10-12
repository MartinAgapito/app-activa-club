import { beforeEach, describe, expect, it, vi } from 'vitest';

const createMaintenanceBlockMock = vi.fn();
vi.mock('../../resources/maintenance', () => ({
  createMaintenanceBlock: createMaintenanceBlockMock,
  releaseMaintenanceBlock: vi.fn(),
}));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./maintenance-create');

const validBody = {
  startsAt: '2026-07-20T13:00:00Z',
  endsAt: '2026-07-20T18:00:00Z',
  reason: 'Limpieza de piscina',
};

function buildEvent(options: {
  resourceId?: string | null;
  body?: unknown;
  claims?: Record<string, string>;
}) {
  const resourceId = options.resourceId === undefined ? 'piscina-1' : options.resourceId;
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: `/resources/${resourceId ?? ''}/maintenance`,
    pathParameters: resourceId ? { resourceId } : null,
    body: options.body === undefined ? JSON.stringify(validBody) : JSON.stringify(options.body),
    claims: options.claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('POST /resources/{resourceId}/maintenance', () => {
  beforeEach(() => {
    createMaintenanceBlockMock.mockReset();
  });

  it('criterio 8: un member recibe 403 FORBIDDEN', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'member-sub', 'cognito:groups': '[member]' } }),
    );

    expect(result.statusCode).toBe(403);
    expect(createMaintenanceBlockMock).not.toHaveBeenCalled();
  });

  it('criterio 2: endsAt <= startsAt devuelve 400', async () => {
    const result = await handler(
      buildEvent({ body: { ...validBody, endsAt: validBody.startsAt } }),
    );

    expect(result.statusCode).toBe(400);
    expect(createMaintenanceBlockMock).not.toHaveBeenCalled();
  });

  it('criterio 2: cuerpo que no cumple el esquema devuelve 400', async () => {
    const result = await handler(buildEvent({ body: { startsAt: 'ayer' } }));

    expect(result.statusCode).toBe(400);
  });

  it('criterio 1: admin crea el bloqueo y responde 201', async () => {
    const response = {
      blockId: 'block-1',
      resourceId: 'piscina-1',
      startsAt: validBody.startsAt,
      endsAt: validBody.endsAt,
      reason: validBody.reason,
      affectedReservationCount: 2,
    };
    createMaintenanceBlockMock.mockResolvedValue(response);

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual(response);
    expect(createMaintenanceBlockMock).toHaveBeenCalledWith({
      resourceId: 'piscina-1',
      startsAt: validBody.startsAt,
      endsAt: validBody.endsAt,
      reason: validBody.reason,
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
      requestId: expect.any(String),
    });
  });

  it('criterio 3: propaga 404 NOT_FOUND', async () => {
    createMaintenanceBlockMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el recurso indicado.'),
    );

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(404);
  });
});
