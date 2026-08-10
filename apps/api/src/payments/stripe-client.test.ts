import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createPaymentIntentMock = vi.fn();

/**
 * `class FakeStripeCardError` imita la forma real de `Stripe.errors.StripeCardError`
 * (ver `node_modules/stripe/cjs/Error.d.ts`): hereda de `Error`, expone
 * `type: 'StripeCardError'`, `code`, `decline_code` y, opcionalmente,
 * `payment_intent` con su propio `last_payment_error`.
 */
class FakeStripeCardError extends Error {
  readonly type = 'StripeCardError';
  readonly code: string | undefined;
  readonly decline_code: string | undefined;
  readonly payment_intent:
    { status: string; last_payment_error?: { code?: string; decline_code?: string } } | undefined;

  constructor(props: {
    code?: string | undefined;
    decline_code?: string | undefined;
    payment_intent?:
      { status: string; last_payment_error?: { code?: string; decline_code?: string } } | undefined;
  }) {
    super('Your card was declined.');
    this.code = props.code;
    this.decline_code = props.decline_code;
    this.payment_intent = props.payment_intent;
  }
}

vi.mock('stripe', () => {
  class MockStripe {
    paymentIntents = { create: createPaymentIntentMock };
    static errors = { StripeCardError: FakeStripeCardError };
  }
  return { default: MockStripe };
});

const { createStripeChargeClient, resetStripeClientForTests } = await import('./stripe-client');

const baseInput = {
  stripePaymentMethodId: 'pm_test_123',
  amount: 12_000,
  currency: 'PEN' as const,
  reference: 'payment-1',
  idempotencyKey: 'idem-key-1',
};

describe('createStripeChargeClient', () => {
  beforeEach(() => {
    resetStripeClientForTests();
    createPaymentIntentMock.mockReset();
  });

  it('crea el PaymentIntent con los parámetros exactos de ADR-0011 §D3', async () => {
    createPaymentIntentMock.mockResolvedValue({ id: 'pi_1', status: 'succeeded' });
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    await chargeClient(baseInput);

    expect(createPaymentIntentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12_000,
        currency: 'pen',
        payment_method: 'pm_test_123',
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: { paymentId: 'payment-1' },
      }),
      { idempotencyKey: 'idem-key-1' },
    );
  });

  it('status succeeded -> APPROVED con stripePaymentIntentId (criterio 5/D5)', async () => {
    createPaymentIntentMock.mockResolvedValue({ id: 'pi_ok_1', status: 'succeeded' });
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    const outcome = await chargeClient(baseInput);

    expect(outcome).toEqual({ outcome: 'APPROVED', stripePaymentIntentId: 'pi_ok_1' });
  });

  it.each(['processing', 'requires_action', 'requires_confirmation', 'requires_capture'])(
    'status %s -> AMBIGUOUS (D5)',
    async (status) => {
      createPaymentIntentMock.mockResolvedValue({ id: 'pi_2', status });
      const chargeClient = createStripeChargeClient('sk_test_xxx');

      const outcome = await chargeClient(baseInput);

      expect(outcome).toEqual({ outcome: 'AMBIGUOUS' });
    },
  );

  it.each(['requires_payment_method', 'canceled'])(
    'status %s -> DECLINED con failureReason del catálogo propio (D5)',
    async (status) => {
      createPaymentIntentMock.mockResolvedValue({
        id: 'pi_3',
        status,
        last_payment_error: { code: 'insufficient_funds' },
      });
      const chargeClient = createStripeChargeClient('sk_test_xxx');

      const outcome = await chargeClient(baseInput);

      expect(outcome).toEqual({ outcome: 'DECLINED', reason: 'Fondos insuficientes.' });
    },
  );

  it('StripeCardError (confirm:true, tarjeta rechazada) -> DECLINED, nunca se propaga como excepción (criterio 6)', async () => {
    createPaymentIntentMock.mockRejectedValue(
      new FakeStripeCardError({
        code: 'card_declined',
        decline_code: 'generic_decline',
        payment_intent: { status: 'requires_payment_method' },
      }),
    );
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    const outcome = await chargeClient(baseInput);

    expect(outcome).toEqual({ outcome: 'DECLINED', reason: 'Tarjeta rechazada por el emisor.' });
  });

  it('StripeCardError sin decline_code ni code reconocido -> DECLINED con mensaje genérico propio (nunca el del proveedor)', async () => {
    createPaymentIntentMock.mockRejectedValue(new FakeStripeCardError({}));
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    const outcome = await chargeClient(baseInput);

    expect(outcome).toEqual({ outcome: 'DECLINED', reason: 'Pago rechazado.' });
    expect((outcome as { reason: string }).reason).not.toContain('declined');
  });

  it('StripeCardError con decline_code vacío (runtime real del SDK cuando no lo informa) recurre a code, no se "atasca" (D9)', async () => {
    // `StripeCardError.decline_code` es `string` no opcional en el tipado del
    // SDK pero el SDK real lo inicializa a `''` cuando no viene informado
    // (`node_modules/stripe/cjs/Error.js`); una cadena de `??` no avanzaría
    // más allá de `''`, por eso `firstNonEmpty` también descarta vacíos.
    createPaymentIntentMock.mockRejectedValue(
      new FakeStripeCardError({ code: 'expired_card', decline_code: '' }),
    );
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    const outcome = await chargeClient(baseInput);

    expect(outcome).toEqual({ outcome: 'DECLINED', reason: 'La tarjeta está vencida.' });
  });

  it('excepción que no es StripeCardError (red/timeout) se propaga sin normalizar (la normaliza charge.ts, criterio 5)', async () => {
    createPaymentIntentMock.mockRejectedValue(new Error('ECONNRESET'));
    const chargeClient = createStripeChargeClient('sk_test_xxx');

    await expect(chargeClient(baseInput)).rejects.toThrow('ECONNRESET');
  });
});

afterEach(() => {
  resetStripeClientForTests();
});
