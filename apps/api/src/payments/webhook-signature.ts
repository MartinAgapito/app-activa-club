// Verificación de firma del webhook de Culqi (US-024, criterio 2/8; RT-14;
// ADR-0007).
//
// ESQUEMA DE VERIFICACIÓN IMPLEMENTADO (documentado explícitamente porque
// todavía no existe una cuenta Culqi sandbox real contra la cual confirmarlo,
// ver la historia US-024, precondiciones):
//
// - HMAC-SHA256 del **cuerpo crudo** de la solicitud (antes de cualquier
//   `JSON.parse`) con un secreto compartido (`../payments/webhook-secret.ts`,
//   nunca la llave privada de cobro), codificado en hexadecimal.
// - El valor esperado se compara contra el header de firma con
//   `crypto.timingSafeEqual` (comparación en tiempo constante: evita que un
//   atacante infiera la firma correcta midiendo cuánto tarda cada intento).
// - Este es el patrón estándar de la mayoría de proveedores de webhooks
//   firmados (Stripe, GitHub, MercadoPago): HMAC del payload crudo +
//   comparación en tiempo constante. Se adopta aquí como la mejor práctica
//   por defecto mientras no exista documentación oficial de Culqi que la
//   contradiga.
//
// A CONFIRMAR contra la documentación real de Culqi cuando exista la cuenta
// sandbox (ver también el reporte de la PR que introduce este archivo):
// - El nombre exacto del header de firma (aquí se asume `X-Culqi-Signature`).
// - El algoritmo exacto (aquí se asume HMAC-SHA256) y el formato del valor
//   del header (aquí se acepta tanto hex "pelado" como el prefijo `sha256=`,
//   patrón usado por GitHub/Stripe).
// - Si Culqi firma el cuerpo crudo tal cual (asunción de este módulo) o
//   alguna variante (p. ej. cuerpo + timestamp concatenados, como hace
//   Stripe para mitigar replay); si Culqi documentara un esquema anti-replay
//   con timestamp, debe incorporarse aquí.

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Nombre del header de firma (asunción documentada arriba; a confirmar contra Culqi real). */
const SIGNATURE_HEADER_NAME = 'x-culqi-signature';

const HEX_PATTERN = /^[0-9a-f]+$/;

/**
 * Busca el header de firma de forma insensible a mayúsculas/minúsculas:
 * API Gateway (integración proxy REST) preserva el casing tal cual llega en
 * la solicitud, que puede variar entre clientes HTTP.
 */
export function extractSignatureHeader(
  headers: Record<string, string | undefined> | null | undefined,
): string | undefined {
  if (!headers) return undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === SIGNATURE_HEADER_NAME && value) return value;
  }
  return undefined;
}

function normalizeSignatureValue(raw: string): string {
  const withoutPrefix = raw.startsWith('sha256=') ? raw.slice('sha256='.length) : raw;
  return withoutPrefix.trim().toLowerCase();
}

/**
 * Verifica que `rawBody` fue firmado con `secret` (criterio 2: se llama
 * **siempre** antes de leer o aplicar cualquier efecto del evento). Nunca
 * lanza: una firma ausente, mal formada o que no coincide simplemente se
 * evalúa como inválida (`false`), para que el llamante decida el rechazo sin
 * depender de manejo de excepciones para el camino esperado.
 */
export function verifyCulqiWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const provided = normalizeSignatureValue(signatureHeader);
  if (!HEX_PATTERN.test(provided) || provided.length % 2 !== 0) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  // `timingSafeEqual` exige buffers de igual longitud; una firma de longitud
  // distinta a la esperada nunca es válida y se descarta sin comparar (no es
  // una fuga de temporización explotable: la longitud del hex-digest de
  // SHA-256 es pública/constante, no depende del secreto).
  if (providedBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
