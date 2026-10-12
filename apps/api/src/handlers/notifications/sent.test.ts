import { beforeEach, describe, expect, it, vi } from 'vitest';

const listSentNotificationsMock = vi.fn();
vi.mock('../../notifications/sent', () => ({ listSentNotifications: listSentNotificationsMock }));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./sent');

function buildEvent(query: Record<string, string> | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/notifications/sent',
    queryStringParameters: query,
    claims: claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('GET /notifications/sent', () => {
  beforeEach(() => {
    listSentNotificationsMock.mockReset();
    listSentNotificationsMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('200 con la página', async () => {
    listSentNotificationsMock.mockResolvedValue({
      items: [{ notificationId: 'n-1' }],
      nextCursor: 'c',
    });
    const result = await handler(buildEvent(null));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      items: [{ notificationId: 'n-1' }],
      nextCursor: 'c',
    });
    expect(listSentNotificationsMock).toHaveBeenCalledWith({});
  });

  it('reenvía cursor y limit validados', async () => {
    await handler(buildEvent({ cursor: 'abc', limit: '10' }));
    expect(listSentNotificationsMock).toHaveBeenCalledWith({ cursor: 'abc', limit: 10 });
  });

  it('403 para un member', async () => {
    const result = await handler(
      buildEvent(null, { sub: 'member-sub', 'cognito:groups': '[member]' }),
    );
    expect(result.statusCode).toBe(403);
    expect(listSentNotificationsMock).not.toHaveBeenCalled();
  });

  it('401 sin identidad', async () => {
    expect((await handler(buildEvent(null, {}))).statusCode).toBe(401);
  });

  it('400 con limit fuera de rango', async () => {
    const result = await handler(buildEvent({ limit: '1000' }));
    expect(result.statusCode).toBe(400);
    expect(listSentNotificationsMock).not.toHaveBeenCalled();
  });
});
