import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@activa-club/shared-types';

const updateMemberProfileMock = vi.fn();
vi.mock('../../members/update-profile', () => ({ updateMemberProfile: updateMemberProfileMock }));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./patch-me');

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

describe('PATCH /members/me', () => {
  beforeEach(() => {
    updateMemberProfileMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[admin]' },
      body: JSON.stringify({ phone: '999000111' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(updateMemberProfileMock).not.toHaveBeenCalled();
  });

  it('actualiza el teléfono y devuelve el perfil actualizado (criterio 2)', async () => {
    updateMemberProfileMock.mockResolvedValue(sampleMember);
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ phone: '999000111' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Member;
    expect(body.phone).toBe('999000111');
    expect(updateMemberProfileMock).toHaveBeenCalledWith({
      cognitoSub: 'test-sub',
      request: { phone: '999000111' },
    });
  });

  it('descarta campos no editables (dni/email/memberStatus) sin romper la unicidad (criterio 3)', async () => {
    updateMemberProfileMock.mockResolvedValue(sampleMember);
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({
        phone: '999000111',
        dni: '99999999',
        email: 'otro@example.com',
        memberStatus: 'ACTIVE',
      }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    expect(updateMemberProfileMock).toHaveBeenCalledWith({
      cognitoSub: 'test-sub',
      request: { phone: '999000111' },
    });
  });

  it('devuelve 400 VALIDATION_ERROR con teléfono inválido, sin invocar updateMemberProfile (criterio 4)', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ phone: 'abc' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(updateMemberProfileMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si no se envía ningún campo', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({}),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(updateMemberProfileMock).not.toHaveBeenCalled();
  });

  it('propaga 404 NOT_FOUND si no existe socio enlazado a la cuenta', async () => {
    updateMemberProfileMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.'),
    );
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: JSON.stringify({ phone: '999000111' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'PATCH',
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
      body: null,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});
