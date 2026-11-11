import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paginated } from '@activa-club/shared-types';
import type { MemberSummary } from '@activa-club/shared-types';

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
const { handler } = await import('./list');

describe('GET /members?status=PENDING', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es admin', async () => {
    const event = buildCognitoProxyEvent({
      path: '/members',
      queryStringParameters: { status: 'PENDING' },
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si falta el parámetro status', async () => {
    const event = buildCognitoProxyEvent({
      path: '/members',
      queryStringParameters: null,
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('lista los socios PENDING (criterio 1) delegando en la Query de GSI2', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          memberId: '01J000000000000000000TEST',
          dni: '10203040',
          firstName: 'Juan',
          lastName: 'Pérez',
          origin: 'NEW',
          memberStatus: 'PENDING',
          membershipStatus: 'NONE',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
    });

    const event = buildCognitoProxyEvent({
      path: '/members',
      queryStringParameters: { status: 'PENDING' },
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Paginated<MemberSummary>;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.memberStatus).toBe('PENDING');
    expect(body.nextCursor).toBeNull();

    const input = (sendMock.mock.calls[0]?.[0] as { input: { IndexName?: string } }).input;
    expect(input.IndexName).toBe('GSI2');
  });

  it('incluye membershipEndsAt y outstandingBalance sin datos sensibles (criterio 4)', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          memberId: '01J000000000000000000TEST',
          dni: '10203040',
          firstName: 'Juan',
          lastName: 'Pérez',
          email: 'juan@example.com',
          phone: '999000111',
          cognitoSub: 'sub',
          legacyId: 'L-1',
          rejectionReason: null,
          origin: 'NEW',
          memberStatus: 'PENDING',
          membershipStatus: 'NONE',
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
    });

    const result = await handler(
      buildCognitoProxyEvent({
        path: '/members',
        queryStringParameters: { status: 'PENDING' },
        claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
      }),
    );

    const body = JSON.parse(result.body) as { items: Record<string, unknown>[] };
    expect(body.items[0]).toMatchObject({ membershipEndsAt: null, outstandingBalance: 0 });
    for (const forbidden of ['email', 'phone', 'cognitoSub', 'legacyId', 'rejectionReason']) {
      expect(body.items[0]).not.toHaveProperty(forbidden);
    }
  });
});

describe('GET /members?status=&membershipStatus= (US-052)', () => {
  const admin = { sub: 'admin-sub', 'cognito:groups': '[admin]' };

  beforeEach(() => {
    sendMock.mockReset();
  });

  it('filtra por la situación de membresía con FilterExpression sobre GSI2', async () => {
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          memberId: '01J000000000000000000DEBT',
          dni: '10203040',
          firstName: 'Ana',
          lastName: 'Gómez',
          origin: 'MIGRATED',
          memberStatus: 'ACTIVE',
          membershipStatus: 'ACTIVE',
          membershipEndsAt: '2026-12-31T05:00:00.000Z',
          outstandingBalance: 5000,
          createdAt: '2026-07-01T00:00:00Z',
        },
      ],
    });

    const result = await handler(
      buildCognitoProxyEvent({
        path: '/members',
        queryStringParameters: { status: 'ACTIVE', membershipStatus: 'DEBT', limit: '10' },
        claims: admin,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Paginated<MemberSummary>;
    expect(body.items[0]?.outstandingBalance).toBe(5000);
    const input = (
      sendMock.mock.calls[0]?.[0] as {
        input: { IndexName?: string; FilterExpression?: string };
      }
    ).input;
    expect(input.IndexName).toBe('GSI2');
    expect(input.FilterExpression).toContain('#ms');
  });

  it.each([
    ['membershipStatus fuera del enum', { status: 'ACTIVE', membershipStatus: 'PAUSED' }],
    ['membershipStatus sin status', { membershipStatus: 'DEBT' }],
    ['limit fuera de rango', { status: 'ACTIVE', membershipStatus: 'DEBT', limit: '101' }],
  ])('devuelve 400 VALIDATION_ERROR: %s', async (_name, query) => {
    const result = await handler(
      buildCognitoProxyEvent({
        path: '/members',
        queryStringParameters: query,
        claims: admin,
      }),
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('devuelve 403 a un socio aunque envíe un filtro válido', async () => {
    const result = await handler(
      buildCognitoProxyEvent({
        path: '/members',
        queryStringParameters: { status: 'ACTIVE', membershipStatus: 'DEBT' },
        claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
      }),
    );

    expect(result.statusCode).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('página parcial: tras agotar 5 lecturas devuelve [] con nextCursor no nulo', async () => {
    sendMock.mockResolvedValue({
      Items: [],
      LastEvaluatedKey: { PK: 'MEMBER#z', SK: 'PROFILE', GSI2PK: 'p', GSI2SK: 'z' },
    });

    const result = await handler(
      buildCognitoProxyEvent({
        path: '/members',
        queryStringParameters: { status: 'ACTIVE', membershipStatus: 'EXPIRED', limit: '2' },
        claims: admin,
      }),
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Paginated<MemberSummary>;
    expect(body.items).toEqual([]);
    expect(body.nextCursor).not.toBeNull();
    expect(sendMock).toHaveBeenCalledTimes(5);
  });
});
