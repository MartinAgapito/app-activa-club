import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@activa-club/shared-types';

const updateMemberAutoRenewMock = vi.fn();
vi.mock('../../members/update-auto-renew', () => ({
  updateMemberAutoRenew: updateMemberAutoRenewMock,
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./patch-me-auto-renew');

const sampleMember: Member = {
  memberId: '01J000000000000000000TEST',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: '999000111',
  origin: 'MIGRATED',
  memberStatus: 'ACTIVE',
  cognitoSub: 'test-sub',
  rejectionReason: null,
  membershipType: 'ANNUAL',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-15T00:00:00Z',
  membershipEndsAt: '2027-01-15T00:00:00Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('PATCH /members/me/auto-renew', () => {
  beforeEach(() => {
    updateMemberAutoRenewMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[admin]' },
      body: JSON.stringify({ enabled: true }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(updateMemberAutoRenewMock).not.toHaveBeenCalled();
  });

  it('activa la renovación automática (criterio 6)', async () => {
    updateMemberAutoRenewMock.mockResolvedValue({ ...sampleMember, autoRenew: true });
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ enabled: true }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Member;
    expect(body.autoRenew).toBe(true);
    expect(updateMemberAutoRenewMock).toHaveBeenCalledWith({
      cognitoSub: 'test-sub',
      enabled: true,
    });
  });

  it('desactiva la renovación automática con efecto inmediato (criterio 7)', async () => {
    updateMemberAutoRenewMock.mockResolvedValue({ ...sampleMember, autoRenew: false });
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ enabled: false }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Member;
    expect(body.autoRenew).toBe(false);
    expect(updateMemberAutoRenewMock).toHaveBeenCalledWith({
      cognitoSub: 'test-sub',
      enabled: false,
    });
  });

  it('propaga 422 MEMBER_NOT_APPROVED si el socio no está aprobado (criterio 3)', async () => {
    updateMemberAutoRenewMock.mockRejectedValue(
      new AppError('MEMBER_NOT_APPROVED', 'El socio debe estar aprobado o activo.'),
    );
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ enabled: true }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBER_NOT_APPROVED');
  });

  it('devuelve 400 VALIDATION_ERROR si el body no trae enabled', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({}),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(updateMemberAutoRenewMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si enabled no es booleano', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ enabled: 'yes' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(updateMemberAutoRenewMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: null,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });

  it('ignora cualquier memberId enviado en el body: la identidad sale siempre del JWT (criterio 9)', async () => {
    updateMemberAutoRenewMock.mockResolvedValue({ ...sampleMember, autoRenew: true });
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      // `memberId` no forma parte de `autoRenewSchema`: no hay forma de que
      // este valor llegue al orquestador ni de que afecte a otro socio.
      body: JSON.stringify({ enabled: true, memberId: 'otro-socio-cualquiera' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(updateMemberAutoRenewMock).toHaveBeenCalledWith({
      cognitoSub: 'test-sub',
      enabled: true,
    });
  });

  it('propaga 401 si no hay identidad autenticada resoluble', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me/auto-renew',
      claims: { 'cognito:groups': '[member]' } as unknown as Record<string, string>,
      body: JSON.stringify({ enabled: true }),
    });
    // Sin `sub` en los claims, `extractIdentity` no puede resolver identidad.
    (event.requestContext.authorizer as { claims: Record<string, string> }).claims = {
      'cognito:groups': '[member]',
    };

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });
});
