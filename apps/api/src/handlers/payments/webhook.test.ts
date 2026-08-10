import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'whsec_test_secret';
const VALID_SIGNATURE = 'valid-signature';

/**
 * Mock de `Stripe.webhooks.constructEvent` (método estático, no requiere
 * instanciar el cliente completo — ver `node_modules/stripe/cjs/stripe.core.d.ts`,
 * `static webhooks`). Simula la verificación real: solo "acepta" el par
 * firma/secreto exactos, y devuelve el cuerpo ya parseado como `Stripe.Event`
 * cuando la firma es válida (igual que el SDK real).
 */
const constructEventMock = vi.fn();
vi.mock('stripe', () => ({
  default: class MockStripe {
    static webhooks = { constructEvent: constructEventMock };
  },
}));

const processStripeWebhookEventMock = vi.fn();
vi.mock('../../payments/webhook', () => ({
  processStripeWebhookEvent: processStripeWebhookEventMock,
}));

const getStripeWebhookSecretMock = vi.fn(async () => SECRET);
vi.mock('../../payments/webhook-secret', () => ({
  getStripeWebhookSecret: getStripeWebhookSecretMock,
}));

const { buildProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./webhook');

const validEventBody = JSON.stringify({
  type: 'payment_intent.succeeded',
  data: { object: { id: 'pi_test_1', metadata: { paymentId: 'payment-1' } } },
});

function buildEvent(body: string, options: { signature?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.signature !== undefined) headers['Stripe-Signature'] = options.signature;
  return buildProxyEvent({
    httpMethod: 'POST',
    path: '/payments/webhook',
    body,
    headers,
  });
}

describe('POST /payments/webhook', () => {
  beforeEach(() => {
    processStripeWebhookEventMock.mockReset();
    getStripeWebhookSecretMock.mockClear();
    constructEventMock.mockReset();
    constructEventMock.mockImplementation((rawBody: string, signature: string, secret: string) => {
      if (signature !== VALID_SIGNATURE || secret !== SECRET) {
        throw new Error('No signatures found matching the expected signature for payload');
      }
      return JSON.parse(rawBody);
    });
  });

  it('firma válida: procesa el evento y responde 202 (criterio 1)', async () => {
    processStripeWebhookEventMock.mockResolvedValue('CONFIRMED');

    const event = buildEvent(validEventBody, { signature: VALID_SIGNATURE });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    expect(processStripeWebhookEventMock).toHaveBeenCalledTimes(1);
    const callArg = processStripeWebhookEventMock.mock.calls[0]?.[0] as { event: { type: string } };
    expect(callArg.event.type).toBe('payment_intent.succeeded');
  });

  it('firma inválida: rechaza con 4xx, sin procesar el evento (criterio 2/8)', async () => {
    const event = buildEvent(validEventBody, { signature: 'firma-completamente-incorrecta' });

    const result = await handler(event);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.statusCode).toBeLessThan(500);
    expect(processStripeWebhookEventMock).not.toHaveBeenCalled();
  });

  it('firma ausente: rechaza con 4xx, sin procesar el evento (criterio 2/8)', async () => {
    const event = buildEvent(validEventBody);

    const result = await handler(event);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.statusCode).toBeLessThan(500);
    expect(processStripeWebhookEventMock).not.toHaveBeenCalled();
    // Nunca se intenta verificar sin header (constructEvent ni se invoca).
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it('cuerpo firmado pero mal formado (no cumple el esquema): 400 VALIDATION_ERROR, sin exponer detalles internos', async () => {
    const malformedBody = JSON.stringify({ type: 'payment_intent.succeeded' }); // sin "data"
    const event = buildEvent(malformedBody, { signature: VALID_SIGNATURE });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(processStripeWebhookEventMock).not.toHaveBeenCalled();
  });

  it('responde 202 igual para un pago no reconocido, sin filtrar esa información al emisor (criterio 6/7)', async () => {
    processStripeWebhookEventMock.mockResolvedValue('PAYMENT_NOT_FOUND');

    const event = buildEvent(validEventBody, { signature: VALID_SIGNATURE });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
  });

  it('responde 202 igual cuando el pago ya estaba resuelto (convergencia, criterio 4/5/10)', async () => {
    processStripeWebhookEventMock.mockResolvedValue('ALREADY_RESOLVED');

    const event = buildEvent(validEventBody, { signature: VALID_SIGNATURE });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
  });

  it('responde 202 igual para un tipo de evento que este backend no procesa (criterio 9)', async () => {
    processStripeWebhookEventMock.mockResolvedValue('IGNORED');
    const otherBody = JSON.stringify({
      type: 'charge.refunded',
      data: { object: { id: 'ch_1' } },
    });

    const event = buildEvent(otherBody, { signature: VALID_SIGNATURE });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
  });

  it('nunca refleja el cuerpo crudo del webhook ni el secreto en la respuesta de error (RN-PAG-08, sin exponer info interna)', async () => {
    const event = buildEvent(validEventBody, { signature: 'no-valida' });

    const result = await handler(event);

    expect(result.body).not.toContain('pi_test_1');
    expect(result.body).not.toContain(SECRET);
  });
});
