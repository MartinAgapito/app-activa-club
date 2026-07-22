import { describe, expect, it } from 'vitest';
import { decodeJwtPayload } from './jwt';
import { createFakeIdToken } from '../test/fake-jwt';

describe('decodeJwtPayload', () => {
  it('decodifica el payload de un JWT válido', () => {
    const token = createFakeIdToken({ sub: 'abc-123', 'cognito:groups': ['member'] });

    const claims = decodeJwtPayload<{ sub: string; 'cognito:groups': string[] }>(token);

    expect(claims).toEqual({ sub: 'abc-123', 'cognito:groups': ['member'] });
  });

  it('decodifica correctamente caracteres no ASCII en el payload', () => {
    const token = createFakeIdToken({ name: 'María José' });

    const claims = decodeJwtPayload<{ name: string }>(token);

    expect(claims?.name).toBe('María José');
  });

  it('devuelve null si el token no tiene el formato esperado', () => {
    expect(decodeJwtPayload('no-es-un-jwt')).toBeNull();
  });

  it('devuelve null si el payload no es JSON válido', () => {
    expect(decodeJwtPayload('header.###.signature')).toBeNull();
  });
});
