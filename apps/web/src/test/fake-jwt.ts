// Utilidad exclusiva de pruebas: construye un JWT con forma válida (sin
// firma real) para probar la decodificación de claims (US-014). Nunca usar
// fuera de tests.

function utf8ToBinaryString(value: string): string {
  return Array.from(new TextEncoder().encode(value))
    .map((byte) => String.fromCharCode(byte))
    .join('');
}

function base64UrlEncode(value: string): string {
  const binary = utf8ToBinaryString(value);
  const base64 =
    typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createFakeIdToken(claims: Record<string, unknown>): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  return `${header}.${payload}.fake-signature`;
}
