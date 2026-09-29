import { beforeEach, describe, expect, it, vi } from 'vitest';

const listReservationsMock = vi.fn();
vi.mock('../../reservations/list', () => ({ listReservations: listReservationsMock }));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./list');

function buildEvent(query: Record<string, string> | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/reservations',
    queryStringParameters: query,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /reservations', () => {
  beforeEach(() => {
    listReservationsMock.mockReset();
    listReservationsMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('scope por defecto es "me" y requiere member', async () => {
    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(200);
    expect(listReservationsMock).toHaveBeenCalledWith({ cognitoSub: 'member-sub', scope: 'me' });
  });

  it('un member que pide scope=all recibe 403 FORBIDDEN sin llamar al orquestador', async () => {
    const result = await handler(buildEvent({ scope: 'all' }));

    expect(result.statusCode).toBe(403);
    expect(listReservationsMock).not.toHaveBeenCalled();
  });

  it('un admin puede pedir scope=all', async () => {
    const result = await handler(
      buildEvent(
        { scope: 'all', status: 'PENDING_APPROVAL' },
        {
          sub: 'admin-sub',
          'cognito:groups': '[admin]',
        },
      ),
    );

    expect(result.statusCode).toBe(200);
    expect(listReservationsMock).toHaveBeenCalledWith({
      cognitoSub: 'admin-sub',
      scope: 'all',
      status: 'PENDING_APPROVAL',
    });
  });

  it('un admin que pide scope=me (o ausente) recibe 403 (esta ruta es del socio)', async () => {
    const result = await handler(
      buildEvent(null, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
    );

    expect(result.statusCode).toBe(403);
    expect(listReservationsMock).not.toHaveBeenCalled();
  });

  it('reenvía status/resourceId/from/to/cursor/limit al orquestador', async () => {
    await handler(
      buildEvent({
        status: 'CONFIRMED',
        resourceId: 'futbol-1',
        from: '2026-07-01T00:00:00.000Z',
        to: '2026-07-31T00:00:00.000Z',
        cursor: 'abc',
        limit: '10',
      }),
    );

    expect(listReservationsMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      scope: 'me',
      status: 'CONFIRMED',
      resourceId: 'futbol-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T00:00:00.000Z',
      cursor: 'abc',
      limit: 10,
    });
  });

  it('400 VALIDATION_ERROR si un parámetro no cumple el esquema', async () => {
    const result = await handler(buildEvent({ status: 'NO_EXISTE' }));

    expect(result.statusCode).toBe(400);
    expect(listReservationsMock).not.toHaveBeenCalled();
  });
});
