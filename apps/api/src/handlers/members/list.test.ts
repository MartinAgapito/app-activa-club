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
});
