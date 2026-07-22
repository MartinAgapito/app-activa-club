import { describe, expect, it } from 'vitest';

import { decodeCursor, encodeCursor } from './cursor';

describe('encodeCursor / decodeCursor', () => {
  it('devuelve null cuando no hay LastEvaluatedKey (última página)', () => {
    expect(encodeCursor(undefined)).toBeNull();
  });

  it('codifica y decodifica una clave de continuación (round-trip)', () => {
    const key = {
      PK: 'MEMBER#01J000000000000000000TEST',
      SK: 'PROFILE',
      GSI2PK: 'MEMBER#STATUS#PENDING',
      GSI2SK: '2026-07-01T00:00:00Z#01J000000000000000000TEST',
    };

    const cursor = encodeCursor(key);
    expect(typeof cursor).toBe('string');
    expect(decodeCursor(cursor ?? undefined)).toEqual(key);
  });

  it('devuelve undefined cuando no se recibe cursor (primera página)', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it('lanza VALIDATION_ERROR (400) si el cursor no es base64 válido / no decodifica a JSON', () => {
    expect(() => decodeCursor('no-es-base64-json-!!!')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('lanza VALIDATION_ERROR si el cursor decodifica a algo que no es un objeto', () => {
    const notAnObject = Buffer.from('"solo un string"', 'utf-8').toString('base64url');
    expect(() => decodeCursor(notAnObject)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
