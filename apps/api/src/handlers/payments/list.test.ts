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

const withMemberNamesMock = vi.fn();
vi.mock('../../payments/member-names', () => ({
  withMemberNames: withMemberNamesMock,
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
    withMemberNamesMock.mockReset();
    withMemberNamesMock.mockImplementation(
      async (_client: unknown, items: Array<{ memberId: string }>) =>
        items.map((item) => ({
          ...item,
          member: { memberId: item.memberId, firstName: 'María', lastName: 'Quispe' },
        })),
    );
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

    it('no agrega member ni resuelve nombres (criterio 2/3)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });
      listPaymentsByMemberMock.mockResolvedValue({
        items: [{ paymentId: 'payment-1', memberId: 'member-1' }],
        nextCursor: null,
      });

      const result = await handler(
        buildEvent(null, { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(result.statusCode).toBe(200);
      expect(withMemberNamesMock).not.toHaveBeenCalled();
      const body = JSON.parse(result.body) as { items: Array<Record<string, unknown>> };
      expect(body.items[0]).not.toHaveProperty('member');
    });

    it('acepta el rango from/to sobre su propio historial, normalizado a UTC (criterio 5/7)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });

      const result = await handler(
        buildEvent(
          { from: '2026-10-01T00:00:00-05:00', to: '2026-10-02T00:00:00-05:00' },
          { sub: 'member-sub', 'cognito:groups': '[member]' },
        ),
      );

      expect(result.statusCode).toBe(200);
      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-1', {
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-10-02T05:00:00.000Z',
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

    it('agrega member (solo nombre) a cada pago filtrando por memberId (criterio 1)', async () => {
      listPaymentsByMemberMock.mockResolvedValue({
        items: [
          { paymentId: 'payment-1', memberId: 'member-9' },
          { paymentId: 'payment-2', memberId: 'member-9' },
        ],
        nextCursor: 'c',
      });

      const result = await handler(
        buildEvent({ memberId: 'member-9' }, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(result.statusCode).toBe(200);
      expect(withMemberNamesMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(result.body) as {
        items: Array<{ member: unknown }>;
        nextCursor: string;
      };
      expect(body.nextCursor).toBe('c');
      expect(body.items[1]?.member).toEqual({
        memberId: 'member-9',
        firstName: 'María',
        lastName: 'Quispe',
      });
    });

    it('agrega member filtrando por status (criterio 1)', async () => {
      listPaymentsByStatusMock.mockResolvedValue({
        items: [{ paymentId: 'payment-1', memberId: 'member-3' }],
        nextCursor: null,
      });

      const result = await handler(
        buildEvent({ status: 'FAILED' }, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      const body = JSON.parse(result.body) as { items: Array<{ member: { memberId: string } }> };
      expect(body.items[0]?.member.memberId).toBe('member-3');
    });

    it('un nombre no resoluble da member null y la respuesta sigue siendo 200 (criterio 1)', async () => {
      listPaymentsByStatusMock.mockResolvedValue({
        items: [{ paymentId: 'payment-1', memberId: 'member-3' }],
        nextCursor: null,
      });
      withMemberNamesMock.mockImplementation(
        async (_client: unknown, items: Array<{ memberId: string }>) =>
          items.map((item) => ({ ...item, member: null })),
      );

      const result = await handler(
        buildEvent({ status: 'FAILED' }, { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body) as { items: Array<{ member: unknown }> };
      expect(body.items[0]?.member).toBeNull();
    });

    it('normaliza from/to con offset a UTC y los pasa a la consulta por estado (criterio 5/7)', async () => {
      await handler(
        buildEvent(
          { status: 'SUCCEEDED', from: '2026-10-01T00:00:00-05:00', to: '2026-10-08T00:00:00Z' },
          { sub: 'admin-sub', 'cognito:groups': '[admin]' },
        ),
      );

      expect(listPaymentsByStatusMock).toHaveBeenCalledWith(expect.anything(), 'SUCCEEDED', {
        from: '2026-10-01T05:00:00.000Z',
        to: '2026-10-08T00:00:00.000Z',
      });
    });

    it('combina memberId, status y rango (criterio 5)', async () => {
      await handler(
        buildEvent(
          { memberId: 'member-9', status: 'FAILED', from: '2026-10-01T00:00:00Z' },
          { sub: 'admin-sub', 'cognito:groups': '[admin]' },
        ),
      );

      expect(listPaymentsByMemberMock).toHaveBeenCalledWith(expect.anything(), 'member-9', {
        status: 'FAILED',
        from: '2026-10-01T00:00:00.000Z',
      });
    });

    it('devuelve 400 si solo envía from/to sin memberId ni status (criterio 6)', async () => {
      const result = await handler(
        buildEvent(
          { from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' },
          { sub: 'admin-sub', 'cognito:groups': '[admin]' },
        ),
      );

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body) as { error: { code: string } };
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(listPaymentsByStatusMock).not.toHaveBeenCalled();
      expect(listPaymentsByMemberMock).not.toHaveBeenCalled();
    });

    it('devuelve 400 si from >= to, incluso con offsets que lo igualan (criterio 6)', async () => {
      const claims = { sub: 'admin-sub', 'cognito:groups': '[admin]' };
      const invertidos = await handler(
        buildEvent(
          { status: 'FAILED', from: '2026-10-02T00:00:00Z', to: '2026-10-01T00:00:00Z' },
          claims,
        ),
      );
      const mismoInstante = await handler(
        buildEvent(
          { status: 'FAILED', from: '2026-10-01T00:00:00-05:00', to: '2026-10-01T05:00:00Z' },
          claims,
        ),
      );

      expect(invertidos.statusCode).toBe(400);
      expect(mismoInstante.statusCode).toBe(400);
      expect(listPaymentsByStatusMock).not.toHaveBeenCalled();
    });

    it('devuelve 400 si from o to no son ISO-8601 (criterio 6)', async () => {
      const result = await handler(
        buildEvent(
          { status: 'FAILED', from: 'ayer' },
          { sub: 'admin-sub', 'cognito:groups': '[admin]' },
        ),
      );

      expect(result.statusCode).toBe(400);
      expect(listPaymentsByStatusMock).not.toHaveBeenCalled();
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
