import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMemberDashboardMock = vi.fn();
vi.mock('../../dashboard/member', () => ({ getMemberDashboard: getMemberDashboardMock }));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./member');

function buildEvent(claims?: Record<string, string>, query: Record<string, string> | null = null) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/dashboard/member',
    queryStringParameters: query,
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /dashboard/member', () => {
  beforeEach(() => {
    getMemberDashboardMock.mockReset();
    getMemberDashboardMock.mockResolvedValue({ canReserve: true });
  });

  it('200 con el resumen y usa solo la identidad del token', async () => {
    const result = await handler(buildEvent(undefined, { memberId: 'otro-socio' }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ canReserve: true });
    expect(getMemberDashboardMock).toHaveBeenCalledWith({ cognitoSub: 'member-sub' });
  });

  it('401 sin identidad', async () => {
    const result = await handler(buildEvent({}));
    expect(result.statusCode).toBe(401);
    expect(getMemberDashboardMock).not.toHaveBeenCalled();
  });

  it('403 para un admin', async () => {
    const result = await handler(buildEvent({ sub: 'admin-sub', 'cognito:groups': '[admin]' }));
    expect(result.statusCode).toBe(403);
    expect(getMemberDashboardMock).not.toHaveBeenCalled();
  });

  it('404 si el socio no existe', async () => {
    getMemberDashboardMock.mockRejectedValue(new AppError('NOT_FOUND', 'no'));
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(404);
  });
});
