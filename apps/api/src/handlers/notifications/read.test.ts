import { beforeEach, describe, expect, it, vi } from 'vitest';

const readNotificationMock = vi.fn();
vi.mock('../../notifications/read', () => ({ readNotification: readNotificationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./read');

function buildEvent(notificationId: string | null, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: `/notifications/${notificationId ?? ''}/read`,
    pathParameters: notificationId ? { notificationId } : null,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('POST /notifications/{notificationId}/read', () => {
  beforeEach(() => {
    readNotificationMock.mockReset();
  });

  it('400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent(null));

    expect(result.statusCode).toBe(400);
    expect(readNotificationMock).not.toHaveBeenCalled();
  });

  it('401 si no hay identidad autenticada', async () => {
    const result = await handler(buildEvent('n-1', {}));

    expect(result.statusCode).toBe(401);
    expect(readNotificationMock).not.toHaveBeenCalled();
  });

  it('403 para un admin', async () => {
    const result = await handler(
      buildEvent('n-1', { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
    );

    expect(result.statusCode).toBe(403);
    expect(readNotificationMock).not.toHaveBeenCalled();
  });

  it('member: 200 con la notificación leída y cognitoSub del token', async () => {
    readNotificationMock.mockResolvedValue({
      notificationId: 'n-1',
      readStatus: 'READ',
      readAt: '2026-07-10T15:00:00.000Z',
    });

    const result = await handler(buildEvent('n-1'));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ notificationId: 'n-1', readStatus: 'READ' });
    expect(readNotificationMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      notificationId: 'n-1',
    });
  });

  it('propaga el 404 del orquestador (ajena o inexistente)', async () => {
    readNotificationMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró la notificación indicada.'),
    );

    const result = await handler(buildEvent('n-ajena'));

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error.code).toBe('NOT_FOUND');
  });
});
