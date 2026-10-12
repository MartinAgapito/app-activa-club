// Idempotencia de la emisión (US-040 criterio 8, EP-05 "ningún hecho genera
// dos avisos").
//
// La clave de deduplicación es determinista: `<evento>#<memberId>#<entityId>`,
// donde `entityId` identifica el hecho que originó el aviso (paymentId,
// reservationId, id del ciclo de membresía, etc.). El `notificationId` se
// deriva de esa clave con SHA-256 y se codifica con el alfabeto de ULID
// (26 caracteres Crockford base32), de modo que:
//   - cualquier consumidor que espere un ULID sigue funcionando;
//   - un reintento produce las mismas claves `NOTIFICATION#<id>` y el `Put`
//     condicional `attribute_not_exists(PK)` lo detecta como duplicado, aun
//     cuando `createdAt` (parte del SK de `MemberNotification`) cambie.

import { createHash } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `<evento>#<memberId>#<entityId>`. */
export function buildDedupeKey(event: string, memberId: string, entityId: string): string {
  return `${event}#${memberId}#${entityId}`;
}

/** Deriva un identificador con forma de ULID a partir de la clave de deduplicación. */
export function notificationIdFromDedupeKey(dedupeKey: string): string {
  const digest = createHash('sha256').update(dedupeKey, 'utf8').digest();
  // 128 bits -> 26 caracteres base32 (el primero solo toma 3 bits: rango 0-7, como un ULID válido).
  let value = 0n;
  for (let i = 0; i < 16; i += 1) {
    value = (value << 8n) | BigInt(digest[i] ?? 0);
  }
  let out = '';
  for (let i = 0; i < 26; i += 1) {
    out = CROCKFORD[Number(value & 31n)] + out;
    value >>= 5n;
  }
  return out;
}
