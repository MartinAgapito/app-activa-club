// Decodificación de JWT sin verificar firma — US-014 / ADR-0002.
//
// Uso exclusivo de UX: resolver el claim `cognito:groups` (rol) para decidir
// la navegación disponible. Nunca es control de seguridad — la autorización
// real siempre la valida el backend (API Gateway Cognito Authorizer) contra
// el JWT firmado.

/** Decodifica el payload (segunda parte) de un JWT. Devuelve `null` si el
 * token no tiene el formato esperado o el payload no es JSON válido. */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [, payloadPart] = parts;
  if (!payloadPart) {
    return null;
  }

  try {
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    const utf8 = decodeURIComponent(
      Array.from(binary)
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    return JSON.parse(utf8) as T;
  } catch {
    return null;
  }
}
