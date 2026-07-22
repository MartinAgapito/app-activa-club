import { afterEach, describe, expect, it } from 'vitest';
import {
  clearStoredRefreshToken,
  readStoredRefreshToken,
  storeRefreshToken,
} from './session-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('session-storage', () => {
  it('devuelve null cuando no hay ningún refresh token guardado', () => {
    expect(readStoredRefreshToken()).toBeNull();
  });

  it('persiste y recupera el refresh token', () => {
    storeRefreshToken('refresh-token-value');

    expect(readStoredRefreshToken()).toBe('refresh-token-value');
  });

  it('elimina el refresh token al cerrar sesión', () => {
    storeRefreshToken('refresh-token-value');

    clearStoredRefreshToken();

    expect(readStoredRefreshToken()).toBeNull();
  });

  it('nunca guarda la contraseña: solo existe la clave del refresh token', () => {
    storeRefreshToken('refresh-token-value');

    const keys = Object.keys(window.localStorage);

    expect(keys).toEqual(['activaclub.auth.refreshToken']);
  });
});
