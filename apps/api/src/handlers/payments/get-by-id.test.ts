import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMemberByCognitoSubMock = vi.fn();
vi.mock('../../members/repository', () => ({
  findMemberByCognitoSub: findMemberByCognitoSubMock,
}));

const getPaymentByMemberAndIdMock = vi.fn();
const findPaymentByIdMock = vi.fn();
vi.mock('../../payments/repository', () => ({
  getPaymentByMemberAndId: getPaymentByMemberAndIdMock,
  findPaymentById: findPaymentByIdMock,
  toPaymentSummary: (payment: Record<string, unknown>) => ({
    paymentId: payment['paymentId'],
    memberId: payment['memberId'],
    membershipType: payment['membershipType'],
    amount: payment['amount'],
    currency: payment['currency'],
    paymentStatus: payment['paymentStatus'],
    culqiChargeId: payment['culqiChargeId'],
    createdAt: payment['createdAt'],
    confirmedAt: payment['confirmedAt'],
  }),
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./get-by-id');

const fullPayment = {
  paymentId: 'payment-1',
  memberId: 'member-1',
  membershipType: 'MONTHLY',
  amount: 12_000,
  currency: 'PEN',
  paymentStatus: 'SUCCEEDED',
  culqiChargeId: 'chr_test_1',
  idempotencyKey: 'clave-secreta-interna',
  autoRenewRequested: false,
  failureReason: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  confirmedAt: '2026-08-01T00:05:00.000Z',
};

function buildEvent(paymentId: string | null, claims: Record<string, string>) {
  return buildCognitoProxyEvent({
    path: `/payments/${paymentId ?? ''}`,
    pathParameters: paymentId ? { paymentId } : null,
    claims,
  });
}

describe('GET /payments/{paymentId}', () => {
  beforeEach(() => {
    findMemberByCognitoSubMock.mockReset();
    getPaymentByMemberAndIdMock.mockReset();
    findPaymentByIdMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member ni admin', async () => {
    const result = await handler(
      buildEvent('payment-1', { sub: 'no-role-sub', 'cognito:groups': '[]' }),
    );

    expect(result.statusCode).toBe(403);
  });

  it('devuelve 400 VALIDATION_ERROR si falta el paymentId en la ruta', async () => {
    const result = await handler(
      buildEvent(null, { sub: 'member-sub', 'cognito:groups': '[member]' }),
    );

    expect(result.statusCode).toBe(400);
  });

  describe('member', () => {
    it('devuelve el detalle de su propio pago (criterio 5)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });
      getPaymentByMemberAndIdMock.mockResolvedValue(fullPayment);

      const result = await handler(
        buildEvent('payment-1', { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(result.statusCode).toBe(200);
      expect(getPaymentByMemberAndIdMock).toHaveBeenCalledWith(
        expect.anything(),
        'member-1',
        'payment-1',
      );

      const body = JSON.parse(result.body) as Record<string, unknown>;
      expect(body['paymentId']).toBe('payment-1');
      // Nunca expone campos internos fuera del contrato público (criterio 7).
      expect(body).not.toHaveProperty('idempotencyKey');
      expect(body).not.toHaveProperty('failureReason');
      expect(body).not.toHaveProperty('autoRenewRequested');
    });

    it('devuelve 404 NOT_FOUND (no 403) para un pago ajeno, sin confirmar su existencia (criterio 5)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });
      getPaymentByMemberAndIdMock.mockResolvedValue(undefined);

      const result = await handler(
        buildEvent('payment-ajeno', { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
      // Nunca resuelve el pago ajeno vía la búsqueda global de admin.
      expect(findPaymentByIdMock).not.toHaveBeenCalled();
    });

    it('devuelve 404 NOT_FOUND para un paymentId inexistente (criterio 6)', async () => {
      findMemberByCognitoSubMock.mockResolvedValue({ memberId: 'member-1' });
      getPaymentByMemberAndIdMock.mockResolvedValue(undefined);

      const result = await handler(
        buildEvent('payment-inexistente', { sub: 'member-sub', 'cognito:groups': '[member]' }),
      );

      expect(result.statusCode).toBe(404);
    });
  });

  describe('admin', () => {
    it('devuelve el detalle de cualquier pago', async () => {
      findPaymentByIdMock.mockResolvedValue(fullPayment);

      const result = await handler(
        buildEvent('payment-1', { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(result.statusCode).toBe(200);
      expect(findPaymentByIdMock).toHaveBeenCalledWith(expect.anything(), 'payment-1');
      expect(findMemberByCognitoSubMock).not.toHaveBeenCalled();

      const body = JSON.parse(result.body) as Record<string, unknown>;
      expect(body['paymentId']).toBe('payment-1');
      expect(body).not.toHaveProperty('idempotencyKey');
    });

    it('devuelve 404 NOT_FOUND para un paymentId inexistente (criterio 6)', async () => {
      findPaymentByIdMock.mockResolvedValue(undefined);

      const result = await handler(
        buildEvent('payment-inexistente', { sub: 'admin-sub', 'cognito:groups': '[admin]' }),
      );

      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body) as { error: { code: string } };
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
