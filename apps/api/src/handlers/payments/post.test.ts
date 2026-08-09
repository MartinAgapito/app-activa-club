import { beforeEach, describe, expect, it, vi } from 'vitest';

const createPaymentMock = vi.fn();
vi.mock('../../payments/charge', () => ({ createPayment: createPaymentMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./post');

const validBody = {
  membershipType: 'ANNUAL',
  culqiToken: 'tkn_test_xxx',
  idempotencyKey: '9b1f7c2e-uuid-de-prueba',
  autoRenew: false,
};

function buildEvent(body: unknown, claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: '/payments',
    body: JSON.stringify(body),
    claims: claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('POST /payments', () => {
  beforeEach(() => {
    createPaymentMock.mockReset();
  });

  it('devuelve 403 si el rol autenticado no es member (solo el socio paga su propia membresía)', async () => {
    const event = buildEvent(validBody, { sub: 'admin-sub', 'cognito:groups': '[admin]' });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('crea el pago y responde 201 con el resultado del contrato (criterio 1)', async () => {
    createPaymentMock.mockResolvedValue({
      paymentId: '01J000000000000000000PAY1',
      paymentStatus: 'SUCCEEDED',
      membershipType: 'ANNUAL',
      amount: 120_000,
      currency: 'PEN',
      membershipEndsAt: '2027-08-09T15:00:00.000Z',
    });

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body) as { paymentId: string; paymentStatus: string };
    expect(body.paymentId).toBe('01J000000000000000000PAY1');
    expect(body.paymentStatus).toBe('SUCCEEDED');
    expect(createPaymentMock).toHaveBeenCalledWith({
      cognitoSub: 'member-sub',
      request: validBody,
    });
  });

  it('omite autoRenew del request cuando no se envía (DTO opcional, exactOptionalPropertyTypes)', async () => {
    createPaymentMock.mockResolvedValue({
      paymentId: '01J000000000000000000PAY2',
      paymentStatus: 'SUCCEEDED',
      membershipType: 'MONTHLY',
      amount: 12_000,
      currency: 'PEN',
      membershipEndsAt: '2026-09-09T15:00:00.000Z',
    });
    const { autoRenew: _autoRenew, ...withoutAutoRenew } = validBody;

    await handler(buildEvent(withoutAutoRenew));

    const callArg = createPaymentMock.mock.calls[0]?.[0] as { request: Record<string, unknown> };
    expect('autoRenew' in callArg.request).toBe(false);
  });

  it('devuelve 400 VALIDATION_ERROR con un membershipType inválido, sin invocar createPayment (criterio 6)', async () => {
    const result = await handler(buildEvent({ ...validBody, membershipType: 'WEEKLY' }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si el body incluye cardNumber/cvv no previstos, sin invocar createPayment (US-026 criterio 1, RN-PAG-08)', async () => {
    const result = await handler(
      buildEvent({ ...validBody, cardNumber: '4111111111111111', cvv: '123' }),
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/payments',
      body: null,
      claims: { sub: 'member-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('propaga MEMBER_NOT_APPROVED desde createPayment (criterio 7)', async () => {
    createPaymentMock.mockRejectedValue(
      new AppError('MEMBER_NOT_APPROVED', 'El socio debe estar aprobado o activo para pagar.'),
    );

    const result = await handler(buildEvent(validBody));

    // La historia describe 403 en prosa, pero `lib/errors.ts` (ya
    // implementado, compartido por todo el dominio) mapea
    // `MEMBER_NOT_APPROVED` a 422 junto con el resto de reglas de negocio no
    // satisfechas (`MEMBER_HAS_DEBT`, `MEMBERSHIP_REQUIRED`, etc., mismo
    // criterio que docs/api/contratos-api.md §1.2). Se sigue la convención ya
    // implementada; el ajuste de la prosa de la historia queda señalado en el
    // reporte de esta tarea para que Arquitecto/Product Analyst lo confirmen.
    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('MEMBER_NOT_APPROVED');
  });

  it('propaga 409 PAYMENT_DUPLICATE desde createPayment (criterio 2)', async () => {
    createPaymentMock.mockRejectedValue(
      new AppError('PAYMENT_DUPLICATE', 'Ya existe un pago procesado con esta clave.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('PAYMENT_DUPLICATE');
  });

  it('propaga 422 PAYMENT_FAILED desde createPayment (criterio 4)', async () => {
    createPaymentMock.mockRejectedValue(
      new AppError('PAYMENT_FAILED', 'Tarjeta rechazada por el emisor.'),
    );

    const result = await handler(buildEvent(validBody));

    expect(result.statusCode).toBe(422);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('PAYMENT_FAILED');
  });
});
