import { beforeEach, describe, expect, it, vi } from 'vitest';

const listMaintenanceBlocksMock = vi.fn();
vi.mock('../../resources/maintenance', () => ({
  createMaintenanceBlock: vi.fn(),
  releaseMaintenanceBlock: vi.fn(),
  listMaintenanceBlocks: listMaintenanceBlocksMock,
}));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./maintenance-list');

function buildEvent(options: {
  pathParameters?: Record<string, string> | null;
  query?: Record<string, string> | null;
  claims?: Record<string, string>;
}) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/resources/piscina-1/maintenance',
    pathParameters:
      options.pathParameters === undefined ? { resourceId: 'piscina-1' } : options.pathParameters,
    queryStringParameters: options.query ?? null,
    body: null,
    claims: options.claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

const block = {
  blockId: 'block-1',
  resourceId: 'piscina-1',
  startsAt: '2026-07-20T13:00:00.000Z',
  endsAt: '2026-07-20T18:00:00.000Z',
  reason: 'Limpieza',
  createdBy: 'admin-sub',
  createdAt: '2026-07-01T10:00:00.000Z',
};

describe('GET /resources/{resourceId}/maintenance', () => {
  beforeEach(() => {
    listMaintenanceBlocksMock.mockReset();
  });

  it('un member recibe 403 FORBIDDEN', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'member-sub', 'cognito:groups': '[member]' } }),
    );

    expect(result.statusCode).toBe(403);
    expect(listMaintenanceBlocksMock).not.toHaveBeenCalled();
  });

  it('admin recibe 200 con { items }', async () => {
    listMaintenanceBlocksMock.mockResolvedValue({ items: [block] });

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ items: [block] });
    expect(listMaintenanceBlocksMock).toHaveBeenCalledWith({
      resourceId: 'piscina-1',
      from: undefined,
      to: undefined,
    });
  });

  it('pasa from/to al orquestador', async () => {
    listMaintenanceBlocksMock.mockResolvedValue({ items: [] });

    const result = await handler(
      buildEvent({ query: { from: '2026-07-20T00:00:00Z', to: '2026-07-21T00:00:00Z' } }),
    );

    expect(result.statusCode).toBe(200);
    expect(listMaintenanceBlocksMock).toHaveBeenCalledWith({
      resourceId: 'piscina-1',
      from: '2026-07-20T00:00:00Z',
      to: '2026-07-21T00:00:00Z',
    });
  });

  it('400 VALIDATION_ERROR si from >= to', async () => {
    const result = await handler(
      buildEvent({ query: { from: '2026-07-21T00:00:00Z', to: '2026-07-20T00:00:00Z' } }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
    expect(listMaintenanceBlocksMock).not.toHaveBeenCalled();
  });

  it('400 si from no es ISO-8601', async () => {
    const result = await handler(buildEvent({ query: { from: 'ayer' } }));

    expect(result.statusCode).toBe(400);
  });

  it('400 si falta resourceId (defensivo)', async () => {
    const result = await handler(buildEvent({ pathParameters: null }));

    expect(result.statusCode).toBe(400);
  });

  it('propaga 404 NOT_FOUND', async () => {
    listMaintenanceBlocksMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el recurso indicado.'),
    );

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(404);
  });
});
