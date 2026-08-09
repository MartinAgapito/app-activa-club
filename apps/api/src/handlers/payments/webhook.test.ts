import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-webhook-secret';

const processCulqiWebhookEventMock = vi.fn();
vi.mock('../../payments/webhook', () => ({
  processCulqiWebhookEvent: processCulqiWebhookEventMock,
}));

const getCulqiWebhookSecretMock = vi.fn(async () => SECRET);
vi.mock('../../payments/webhook-secret', () => ({
  getCulqiWebhookSecret: getCulqiWebhookSecretMock,
}));

const { buildProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./webhook');

const validEventBody = JSON.stringify({
  type: 'charge.succeeded',
  data: { object: { id: 'chr_test_1', metadata: { reference: 'payment-1' } } },
});

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function buildEvent(body: string, options: { signature?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.signature !== undefined) headers['X-Culqi-Signature'] = options.signature;
  return buildProxyEvent({
    httpMethod: 'POST',
    path: '/payments/webhook',
    body,
    headers,
  });
}

describe('POST /payments/webhook', () => {
  beforeEach(() => {
    processCulqiWebhookEventMock.mockReset();
    getCulqiWebhookSecretMock.mockClear();
  });

  it('firma válida: procesa el evento y responde 202 (criterio 1)', async () => {
    processCulqiWebhookEventMock.mockResolvedValue('CONFIRMED');

    const event = buildEvent(validEventBody, { signature: sign(validEventBody) });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    expect(processCulqiWebhookEventMock).toHaveBeenCalledTimes(1);
    const callArg = processCulqiWebhookEventMock.mock.calls[0]?.[0] as { event: { type: string } };
    expect(callArg.event.type).toBe('charge.succeeded');
  });

  it('firma inválida: rechaza con 4xx, sin procesar el evento (criterio 2/8)', async () => {
    const event = buildEvent(validEventBody, { signature: 'firma-completamente-incorrecta00' });

    const result = await handler(event);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.statusCode).toBeLessThan(500);
    expect(processCulqiWebhookEventMock).not.toHaveBeenCalled();
  });

  it('firma ausente: rechaza con 4xx, sin procesar el evento (criterio 2/8)', async () => {
    const event = buildEvent(validEventBody);

    const result = await handler(event);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.statusCode).toBeLessThan(500);
    expect(processCulqiWebhookEventMock).not.toHaveBeenCalled();
  });

  it('firma calculada sobre un cuerpo distinto al recibido: rechaza sin procesar (cuerpo alterado en tránsito)', async () => {
    const otherBody = JSON.stringify({
      type: 'charge.failed',
      data: { object: { id: 'chr_x', metadata: { reference: 'payment-x' } } },
    });
    const event = buildEvent(validEventBody, { signature: sign(otherBody) });

    const result = await handler(event);

    expect(result.statusCode).toBeGreaterThanOrEqual(400);
    expect(result.statusCode).toBeLessThan(500);
    expect(processCulqiWebhookEventMock).not.toHaveBeenCalled();
  });

  it('cuerpo firmado pero mal formado (no cumple el esquema): 400 VALIDATION_ERROR, sin exponer detalles internos', async () => {
    const malformedBody = JSON.stringify({ type: 'charge.succeeded' }); // sin "data"
    const event = buildEvent(malformedBody, { signature: sign(malformedBody) });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(processCulqiWebhookEventMock).not.toHaveBeenCalled();
  });

  it('responde 202 igual para un pago no reconocido, sin filtrar esa información al emisor (criterio 6/7)', async () => {
    processCulqiWebhookEventMock.mockResolvedValue('PAYMENT_NOT_FOUND');

    const event = buildEvent(validEventBody, { signature: sign(validEventBody) });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
  });

  it('responde 202 igual cuando el pago ya estaba resuelto (convergencia, criterio 4/5/10)', async () => {
    processCulqiWebhookEventMock.mockResolvedValue('ALREADY_RESOLVED');

    const event = buildEvent(validEventBody, { signature: sign(validEventBody) });
    const result = await handler(event);

    expect(result.statusCode).toBe(202);
  });

  it('nunca refleja el cuerpo crudo del webhook en la respuesta de error (RN-PAG-08, sin exponer info interna)', async () => {
    const event = buildEvent(validEventBody, { signature: 'no-valida' });

    const result = await handler(event);

    expect(result.body).not.toContain('chr_test_1');
    expect(result.body).not.toContain(SECRET);
  });
});
