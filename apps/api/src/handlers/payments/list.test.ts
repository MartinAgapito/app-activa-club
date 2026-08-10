import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMemberByCognitoSubMock = vi.fn();
vi.mock('../../members/repository', () => ({
  findMemberByCognitoSub: findMemberByCognitoSubMock,
}));

const listPaymentsByMemberMock = vi.fn();
const listPaymentsByStatusMock = vi.fn();
vi.mock('../../payments/repository', () => ({
  listPaymentsByMember: listPaymentsByMemberMock,
  listPaymentsByStatus: listPaymentsByStatusMock,
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./list');

const emptyPage = { items: [], nextCursor: null };

function buildEvent(
  queryStringParameters: Record<string, string> | null,
  claims: Record<string, string>,
) {
  return buildCognitoProxyEvent({
    path: '/payments',
    queryStringParameters,
    claims,
  });
}

describe('GET /payments', () => {
  beforeEach(() => {
    findMemberByCognitoSubMock.mockReset();
    listPaymentsByMemberMock.mockReset();
    listPaymentsByStatusMock.mockReset();
    listPaymentsByMemberMock.mockResolvedValue(emptyPage);
    listPaymentsByStatusMock.mockResolvedValue(emptyPage);
  });

  it('devuelve 403 si el rol autenticado no es member ni admin', async () => {
    const result = await handler(buildEvent(null, { sub: 'no-role-sub', 'cognito:groups': '[]' }));

    expect(result.statusCode).toBe(403);
    expect(listPaymentsByMemberMock).not.toHaveBeenCalled();
  });

  describe('member', () => {
    it('devuelve solo el historial propio, resolviendo el memberId por cognitoSub (criterio 1)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });
      listPaymentsByMemberMock.mockResolvedValue({
        items: [
          {
            paymentId: 'payment-1',
            memberId: 'member-1',
            membershipType: 'MONTHLY',
            amount: 12_000,
            currency: 'PEN',
            paymentStatus: 'SUCCEEDED',
            stripePaymentIntentId: 'pi_test_1',
            createdAt: '2026-08-01T00:00:00.000Z',
            confirmedAt: '2026-08-01T00:05:00.000Z',
          },
        ],
        nextCursor: null,
      });

      const result = await handler(
        buildEvent(null, { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(result.statusCode).toBe(200);
      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-1', {});
      const body = JSON.parse(result.body) as { items: unknown[] };
      expect(body.items).toHaveLength(1);
    });

    it('ignora el memberId de otro socio enviado por query: nunca consulta pagos ajenos (criterio 4, crítico)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });

      await handler(
        buildEvent(
          { memberId: 'member-ajeno' },
          { sub: 'member-sub', 'cognito:groups': '[member]' },
        ),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-1', {});
      expect(listPaymentsByMemberMock).not.toHaveBeenCalledWith(
        expect.anything(),
        'member-ajeno',
        expect.anything(),
      );
    });

    it('permite filtrar el propio historial por status', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });

      await handler(
        buildEvent({ status: 'FAILED' }, { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-1', {
        status: 'FAILED',
      });
    });

    it('pasa cursor/limit al repositorio para paginación', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });

      await handler(
        buildEvent(
          { cursor: 'opaque-cursor', limit: '5' },
          { sub: 'member-sub', 'cognito:groups': '[member]' },
        ),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-1', {
        cursor: 'opaque-cursor',
        limit: 5,
      });
    });
  });

  describe('admin', () => {
    it('filtra por memberId cuando se envía (criterio 3)', async () => {
      await handler(
        buildEvent({ memberId: 'member-9' }, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-9', {});
      expect(findMemberByCognitoSubMock).not.toHaveBeenCalled();
    });

    it('combina memberId y status (criterio 3)', async () => {
      await handler(
        buildEvent(
          { memberId: 'member-9', status: 'SUCCEEDED' },
          { sub: 'admin-sub', 'cognito:groups': '[admin]' },
        ),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-9', {
        status: 'SUCCEEDED',
      });
    });

    it('filtra solo por status cuando no se envía memberId (criterio 3)', async () => {
      await handler(
        buildEvent({ status: 'FAILED' }, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(listPaymentsByStatusMock).toHaveBeenCalledWith(expect.anything(), 'FAILED', {});
      expect(listPaymentsByMemberMock).not.toHaveBeenCalled();
    });

    it('devuelve 400 VALIDATION_ERROR si no envía memberId ni status', async () => {
      const result = await handler(
        buildEvent(null, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(listPaymentsByMemberMock).not.toHaveBeenCalled();
      expect(listPaymentsByStatusMock).not.toHaveBeenCalled();
    });
  });
});
