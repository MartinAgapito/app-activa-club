import { describe, expect, it } from 'vitest';

import { stripeWebhookEventSchema } from './webhook-event-schema';

// Regresión: un PaymentIntent real de Stripe trae `last_payment_error: null`
// de forma explícita cuando no hubo error, no lo omite. `.optional()` a
// secas solo acepta `undefined`, así que un evento `payment_intent.succeeded`
// real fallaba la validación con 400 VALIDATION_ERROR (encontrado en la
// verificación en vivo de US-037 contra Stripe test mode real, no en un
// mock). `payment_intent.payment_failed` pasaba porque sí trae un objeto no
// nulo, lo que hizo que el bug pasara inadvertido en las pruebas existentes
// (todas construían el evento ya tipado, sin pasar por este esquema).

describe('stripeWebhookEventSchema', () => {
  it('acepta un evento payment_intent.succeeded real con last_payment_error: null', () => {
    const result = stripeWebhookEventSchema.safeParse({
      id: 'evt_test_1',
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_1',
          amount: 12_000,
          currency: 'pen',
          last_payment_error: null,
          metadata: { paymentId: 'payment-1' },
          status: 'succeeded',
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('acepta un evento payment_intent.payment_failed con last_payment_error como objeto', () => {
    const result = stripeWebhookEventSchema.safeParse({
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_test_2',
          metadata: { paymentId: 'payment-1' },
          last_payment_error: { code: 'card_declined', decline_code: 'generic_decline' },
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('acepta un evento sin last_payment_error (campo ausente, no solo null)', () => {
    const result = stripeWebhookEventSchema.safeParse({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_3', metadata: { paymentId: 'payment-1' } } },
    });

    expect(result.success).toBe(true);
  });

  it('acepta un evento de un type no procesado por este backend, sin metadata.paymentId (criterio 9)', () => {
    const result = stripeWebhookEventSchema.safeParse({
      type: 'payment_intent.created',
      data: { object: { id: 'pi_test_4' } },
    });

    expect(result.success).toBe(true);
  });

  it('rechaza un evento sin data.object.id', () => {
    const result = stripeWebhookEventSchema.safeParse({
      type: 'payment_intent.succeeded',
      data: { object: {} },
    });

    expect(result.success).toBe(false);
  });
});
