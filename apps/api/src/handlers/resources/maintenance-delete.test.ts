import { beforeEach, describe, expect, it, vi } from 'vitest';

const releaseMaintenanceBlockMock = vi.fn();
vi.mock('../../resources/maintenance', () => ({
  createMaintenanceBlock: vi.fn(),
  releaseMaintenanceBlock: releaseMaintenanceBlockMock,
}));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./maintenance-delete');

function buildEvent(options: {
  pathParameters?: Record<string, string> | null;
  claims?: Record<string, string>;
}) {
  return buildCognitoProxyEvent({
    httpMethod: 'DELETE',
    path: '/resources/piscina-1/maintenance/block-1',
    pathParameters:
      options.pathParameters === undefined
        ? { resourceId: 'piscina-1', blockId: 'block-1' }
        : options.pathParameters,
    body: null,
    claims: options.claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('DELETE /resources/{resourceId}/maintenance/{blockId}', () => {
  beforeEach(() => {
    releaseMaintenanceBlockMock.mockReset();
  });

  it('criterio 8: un member recibe 403 FORBIDDEN', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'member-sub', 'cognito:groups': '[member]' } }),
    );

    expect(result.statusCode).toBe(403);
    expect(releaseMaintenanceBlockMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 si falta blockId (defensivo)', async () => {
    const result = await handler(buildEvent({ pathParameters: { resourceId: 'piscina-1' } }));

    expect(result.statusCode).toBe(400);
  });

  it('criterio 6: admin libera y responde 204 sin cuerpo', async () => {
    releaseMaintenanceBlockMock.mockResolvedValue(undefined);

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(204);
    expect(result.body).toBe('');
    expect(releaseMaintenanceBlockMock).toHaveBeenCalledWith({
      resourceId: 'piscina-1',
      blockId: 'block-1',
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
    });
  });

  it('criterio 7: propaga 404 NOT_FOUND', async () => {
    releaseMaintenanceBlockMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el bloqueo indicado.'),
    );

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(404);
  });
});
