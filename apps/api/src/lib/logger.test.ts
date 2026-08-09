// US-026 criterio 4: la lista de campos prohibidos del logger cubre al menos
// `password`, `culqiToken`, `cvv`, `cardNumber`, `culqiSecretKey`, y los
// secretos introducidos por el webhook de Culqi (US-024, ADR-0007).

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
