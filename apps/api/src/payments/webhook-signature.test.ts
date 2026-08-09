import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { extractSignatureHeader, verifyCulqiWebhookSignature } from './webhook-signature';

const SECRET = 'test-webhook-secret';
const RAW_BODY = JSON.stringify({ type: 'charge.succeeded' });

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('verifyCulqiWebhookSignature', () => {
  it('acepta una firma válida en hex plano', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, sign(RAW_BODY), SECRET)).toBe(true);
  });

  it('acepta una firma válida con el prefijo sha256= (patrón Stripe/GitHub)', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, `sha256=${sign(RAW_BODY)}`, SECRET)).toBe(true);
  });

  it('acepta una firma válida sin distinguir mayúsculas/minúsculas del hex', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, sign(RAW_BODY).toUpperCase(), SECRET)).toBe(true);
  });

  it('rechaza una firma ausente (criterio 2)', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, undefined, SECRET)).toBe(false);
  });

  it('rechaza una firma calculada con el secreto incorrecto (criterio 2)', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, sign(RAW_BODY, 'otro-secreto'), SECRET)).toBe(
      false,
    );
  });

  it('rechaza una firma calculada sobre un cuerpo distinto (cuerpo modificado en tránsito)', () => {
    const otherBody = JSON.stringify({ type: 'charge.failed' });
    expect(verifyCulqiWebhookSignature(RAW_BODY, sign(otherBody), SECRET)).toBe(false);
  });

  it('rechaza un valor de firma mal formado (no hexadecimal) sin lanzar', () => {
    expect(() =>
      verifyCulqiWebhookSignature(RAW_BODY, 'no-es-hexadecimal;;;', SECRET),
    ).not.toThrow();
    expect(verifyCulqiWebhookSignature(RAW_BODY, 'no-es-hexadecimal;;;', SECRET)).toBe(false);
  });

  it('rechaza una firma de longitud distinta a la esperada sin lanzar', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, 'abcd', SECRET)).toBe(false);
  });

  it('rechaza una cadena vacía como firma', () => {
    expect(verifyCulqiWebhookSignature(RAW_BODY, '', SECRET)).toBe(false);
  });
});

describe('extractSignatureHeader', () => {
  it('encuentra el header sin importar mayúsculas/minúsculas', () => {
    expect(extractSignatureHeader({ 'X-Culqi-Signature': 'abc123' })).toBe('abc123');
    expect(extractSignatureHeader({ 'x-culqi-signature': 'abc123' })).toBe('abc123');
  });

  it('devuelve undefined si no hay headers o el header no está presente', () => {
    expect(extractSignatureHeader(undefined)).toBeUndefined();
    expect(extractSignatureHeader(null)).toBeUndefined();
    expect(extractSignatureHeader({})).toBeUndefined();
    expect(extractSignatureHeader({ 'Content-Type': 'application/json' })).toBeUndefined();
  });
});
