import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@activa-club/shared-types';

const sendMock = vi.fn();

vi.mock('../../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../../lib/dynamo')>('../../lib/dynamo');
  return {
    ...actual,
    getDocumentClient: () => ({ send: sendMock }),
    tableName: () => 'activa-club-test',
  };
});

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./get-me');

const sampleMember: Member = {
  memberId: '01J000000000000000000TEST',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
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

describe('GET /members/me', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member', async () => {
    const event = buildCognitoProxyEvent({
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('devuelve el perfil del socio autenticado (patrón GSI1 por cognitoSub)', async () => {
    sendMock.mockResolvedValueOnce({ Items: [sampleMember] });
    const event = buildCognitoProxyEvent({
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Member;
    expect(body.memberId).toBe(sampleMember.memberId);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('devuelve 404 si no existe socio enlazado a la cuenta', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] });
    const event = buildCognitoProxyEvent({
      path: '/members/me',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
  });
});
