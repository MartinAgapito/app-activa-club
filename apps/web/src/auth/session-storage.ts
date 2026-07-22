// Persistencia del refresh token de Cognito en el cliente — US-014.
//
// Solo el refresh token se persiste entre recargas de página (en
// `localStorage`, como hace habitualmente el propio SDK de Cognito): el
// access/id token se mantienen únicamente en memoria (ver AuthContext) y se
// renuevan al arrancar la aplicación llamando a `REFRESH_TOKEN_AUTH`. La
// contraseña nunca se guarda en el cliente (criterio de aceptación 7).

const STORAGE_KEY = 'activaclub.auth.refreshToken';

function getStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // Algunos entornos (modo privado estricto, almacenamiento deshabilitado)
    // pueden no exponer localStorage; la sesión simplemente no persiste entre
    // recargas, sin romper el login dentro de la misma pestaña.
    return null;
  }
}

export function readStoredRefreshToken(): string | null {
  return getStorage()?.getItem(STORAGE_KEY) ?? null;
}

export function storeRefreshToken(token: string): void {
  getStorage()?.setItem(STORAGE_KEY, token);
}

export function clearStoredRefreshToken(): void {
  getStorage()?.removeItem(STORAGE_KEY);
}
