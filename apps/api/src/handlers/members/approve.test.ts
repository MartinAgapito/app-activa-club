import { beforeEach, describe, expect, it, vi } from 'vitest';

const approveMemberMock = vi.fn();
vi.mock('../../members/decide', () => ({ approveMember: approveMemberMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./approve');

describe('POST /members/{memberId}/approve', () => {
  beforeEach(() => {
    approveMemberMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es admin', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/approve',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(approveMemberMock).not.toHaveBeenCalled();
  });

  it('aprueba al socio y delega en approveMember con el actor autenticado (criterio 3)', async () => {
    approveMemberMock.mockResolvedValue({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'APPROVED',
    });

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/approve',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { memberId: string; memberStatus: string };
    expect(body).toEqual({ memberId: '01J000000000000000000TEST', memberStatus: 'APPROVED' });
    expect(approveMemberMock).toHaveBeenCalledWith({
      memberId: '01J000000000000000000TEST',
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
    });
  });

  it('propaga CONFLICT (409) cuando el socio ya no está PENDING (criterio 5)', async () => {
    approveMemberMock.mockRejectedValue(
      new AppError('CONFLICT', 'El socio no está pendiente de aprobación.'),
    );

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/approve',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('CONFLICT');
  });
});
