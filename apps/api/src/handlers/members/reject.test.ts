import { beforeEach, describe, expect, it, vi } from 'vitest';

const rejectMemberMock = vi.fn();
vi.mock('../../members/decide', () => ({ rejectMember: rejectMemberMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./reject');

describe('POST /members/{memberId}/reject', () => {
  beforeEach(() => {
    rejectMemberMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es admin', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/reject',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      body: JSON.stringify({ reason: 'Datos no verificables' }),
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(rejectMemberMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si falta el motivo (rechazo sin motivo)', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/reject',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      body: JSON.stringify({}),
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(rejectMemberMock).not.toHaveBeenCalled();
  });

  it('rechaza al socio con el motivo y delega en rejectMember (criterio 4)', async () => {
    rejectMemberMock.mockResolvedValue({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'REJECTED',
    });

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/reject',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      body: JSON.stringify({ reason: 'Datos no verificables' }),
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { memberId: string; memberStatus: string };
    expect(body).toEqual({ memberId: '01J000000000000000000TEST', memberStatus: 'REJECTED' });
    expect(rejectMemberMock).toHaveBeenCalledWith({
      memberId: '01J000000000000000000TEST',
      reason: 'Datos no verificables',
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
    });
  });

  it('propaga CONFLICT (409) cuando el socio ya no está PENDING (criterio 5)', async () => {
    rejectMemberMock.mockRejectedValue(
      new AppError('CONFLICT', 'El socio no está pendiente de aprobación.'),
    );

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/members/01J000000000000000000TEST/reject',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      body: JSON.stringify({ reason: 'Datos no verificables' }),
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
  });
});
