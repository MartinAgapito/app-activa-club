import { beforeEach, describe, expect, it, vi } from 'vitest';

const listNotificationsMock = vi.fn();
vi.mock('../../notifications/list', () => ({ listNotifications: listNotificationsMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./list');

function buildEvent(query: Record<string, string> | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/notifications',
    queryStringParameters: query,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /notifications', () => {
  beforeEach(() => {
    listNotificationsMock.mockReset();
    listNotificationsMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('devuelve 200 con la página y usa solo la identidad del token', async () => {
    listNotificationsMock.mockResolvedValue({
      items: [{ notificationId: 'n-1' }],
      nextCursor: 'abc',
    });

    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [{ notificationId: 'n-1' }],
      nextCursor: 'abc',
    });
    expect(listNotificationsMock).toHaveBeenCalledWith({ cognitoSub: 'member-sub' });
  });

  it('401 si no hay identidad autenticada', async () => {
    const result = await handler(buildEvent(null, {}));

    expect(result.statusCode).toBe(401);
    expect(listNotificationsMock).not.toHaveBeenCalled();
  });

  it('403 para un admin (la bandeja es del socio)', async () => {
    const result = await handler(
      buildEvent(null, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
    );

    expect(result.statusCode).toBe(403);
    expect(listNotificationsMock).not.toHaveBeenCalled();
  });

  it('reenvía unread, cursor y limit ya validados', async () => {
    await handler(buildEvent({ unread: 'true', cursor: 'abc', limit: '10' }));

    expect(listNotificationsMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      unreadOnly: true,
      cursor: 'abc',
      limit: 10,
    });
  });

  it('unread=false se reenvía como false', async () => {
    await handler(buildEvent({ unread: 'false' }));

    expect(listNotificationsMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      unreadOnly: false,
    });
  });

  it('ignora un memberId pasado por query (la identidad sale del token)', async () => {
    await handler(buildEvent({ memberId: 'otro-socio' }));

    expect(listNotificationsMock).toHaveBeenCalledWith({ cognitoSub: 'member-sub' });
  });

  it.each([{ unread: 'si' }, { limit: '0' }, { limit: '101' }, { limit: 'x' }])(
    '400 VALIDATION_ERROR con parámetros inválidos %j',
    async (query) => {
      const result = await handler(buildEvent(query));

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
      expect(listNotificationsMock).not.toHaveBeenCalled();
    },
  );

  it('propaga el error del orquestador (cursor inválido → 400)', async () => {
    listNotificationsMock.mockRejectedValue(
      new AppError('VALIDATION_ERROR', 'El parámetro cursor no es válido.'),
    );

    const result = await handler(buildEvent({ cursor: '%%%' }));

    expect(result.statusCode).toBe(400);
  });
});
