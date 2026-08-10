// US-026 criterio 4 / US-037 criterio 11: la lista de campos prohibidos del
// logger cubre al menos `password`, `cvv`, `cardNumber`, los secretos
// introducidos por el webhook de pagos (US-024), y los campos específicos de
// Stripe (`stripePaymentMethodId`, `stripeSecretKey`, `client_secret`,
// ADR-0011). Se conservan también las pruebas de las claves históricas de
// Culqi (ADR-0007, reemplazado por ADR-0011): siguen en la lista de
// prohibidos y no hacen daño.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from './logger';

describe('logger', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function lastEntry(): Record<string, unknown> {
    const raw = writeSpy.mock.calls.at(-1)?.[0] as string;
    return JSON.parse(raw) as Record<string, unknown>;
  }

  it('nunca emite campos de datos de tarjeta ni el token de Culqi (RN-PAG-08)', () => {
    logger.info('intento de pago', {
      requestId: 'req-1',
      password: 'no-deberia-aparecer',
      culqiToken: 'tkn_test_xxx',
      cvv: '123',
      cardNumber: '4111111111111111',
      culqiSecretKey: 'sk_test_xxx',
    });

    const entry = lastEntry();
    expect(entry['password']).toBeUndefined();
    expect(entry['culqiToken']).toBeUndefined();
    expect(entry['cvv']).toBeUndefined();
    expect(entry['cardNumber']).toBeUndefined();
    expect(entry['culqiSecretKey']).toBeUndefined();
  });

  it('nunca emite los secretos de la llave privada ni de firma del webhook de Culqi (US-024, ADR-0007)', () => {
    logger.warn('webhook sospechoso', {
      requestId: 'req-2',
      culqiPrivateKey: 'sk_live_no',
      culqiWebhookSecret: 'whsec_no',
      webhookSecret: 'whsec_no_alt',
      signature: 'deadbeef',
      signatureHeader: 'sha256=deadbeef',
      rawBody: '{"culqiToken":"tkn_test_xxx"}',
    });

    const entry = lastEntry();
    expect(entry['culqiPrivateKey']).toBeUndefined();
    expect(entry['culqiWebhookSecret']).toBeUndefined();
    expect(entry['webhookSecret']).toBeUndefined();
    expect(entry['signature']).toBeUndefined();
    expect(entry['signatureHeader']).toBeUndefined();
    expect(entry['rawBody']).toBeUndefined();
  });

  it('nunca emite los campos específicos de Stripe (stripePaymentMethodId, stripeSecretKey, client_secret; criterio 11, ADR-0011)', () => {
    logger.info('intento de pago', {
      requestId: 'req-4',
      stripePaymentMethodId: 'pm_test_xxx',
      stripeSecretKey: 'sk_test_xxx',
      client_secret: 'pi_test_secret_xxx',
    });

    const entry = lastEntry();
    expect(entry['stripePaymentMethodId']).toBeUndefined();
    expect(entry['stripeSecretKey']).toBeUndefined();
    expect(entry['client_secret']).toBeUndefined();
  });

  it('conserva los campos no sensibles del evento', () => {
    logger.error('request failed', {
      requestId: 'req-3',
      route: 'POST /payments',
      action: 'CREATE_PAYMENT',
      outcome: 'FAILURE',
      errorCode: 'PAYMENT_FAILED',
    });

    const entry = lastEntry();
    expect(entry['route']).toBe('POST /payments');
    expect(entry['action']).toBe('CREATE_PAYMENT');
    expect(entry['outcome']).toBe('FAILURE');
    expect(entry['errorCode']).toBe('PAYMENT_FAILED');
  });
});
