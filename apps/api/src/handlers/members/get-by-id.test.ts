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
const { handler } = await import('./get-by-id');

const sampleMember: Member = {
  memberId: '01J000000000000000000TEST',
  legacyId: null,
  dni: '10203040',
  email: 'nuevo@example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: null,
  origin: 'NEW',
  memberStatus: 'PENDING',
  cognitoSub: 'cognito-sub-1',
  rejectionReason: null,
  membershipType: null,
  membershipStatus: 'NONE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

describe('GET /members/{memberId}', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es admin', async () => {
    const event = buildCognitoProxyEvent({
      path: '/members/01J000000000000000000TEST',
      pathParameters: { memberId: '01J000000000000000000TEST' },
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('devuelve el detalle del socio (criterio 2)', async () => {
    sendMock.mockResolvedValueOnce({ Item: sampleMember });

    const event = buildCognitoProxyEvent({
      path: `/members/${sampleMember.memberId}`,
      pathParameters: { memberId: sampleMember.memberId },
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Member;
    expect(body.memberId).toBe(sampleMember.memberId);
  });

  it('devuelve 404 NOT_FOUND si el memberId no existe (criterio 5)', async () => {
    sendMock.mockResolvedValueOnce({});

    const event = buildCognitoProxyEvent({
      path: '/members/no-existe',
      pathParameters: { memberId: 'no-existe' },
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
