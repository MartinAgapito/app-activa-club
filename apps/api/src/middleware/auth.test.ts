import { describe, expect, it } from 'vitest';

import { AppError } from '../lib/errors';
import { buildCognitoProxyEvent } from '../testing/fixtures';
import { extractIdentity, requireRole } from './auth';

describe('extractIdentity', () => {
  it('extrae sub, email y roles desde los claims de Cognito', () => {
    const event = buildCognitoProxyEvent({
      claims: { sub: 'abc-123', email: 'a@b.com', 'cognito:groups': '[member]' },
    });
    const identity = extractIdentity(event);
    expect(identity.sub).toBe('abc-123');
    expect(identity.email).toBe('a@b.com');
    expect(identity.roles).toEqual(['member']);
  });

  it('soporta múltiples grupos serializados como arreglo por API Gateway', () => {
    const event = buildCognitoProxyEvent({
      claims: { sub: 'abc-123', 'cognito:groups': '[admin, member]' },
    });
    const identity = extractIdentity(event);
    expect([...identity.roles].sort()).toEqual(['admin', 'member']);
  });

  it('ignora grupos desconocidos fuera de member/admin', () => {
    const event = buildCognitoProxyEvent({
      claims: { sub: 'abc-123', 'cognito:groups': '[member, otro-grupo]' },
    });
    const identity = extractIdentity(event);
    expect(identity.roles).toEqual(['member']);
  });

  it('lanza UNAUTHENTICATED si no hay claims (caso defensivo)', () => {
    const event = buildCognitoProxyEvent();
    // @ts-expect-error -- simula un evento sin authorizer resuelto por API Gateway.
    event.requestContext.authorizer = undefined;
    expect(() => extractIdentity(event)).toThrow(AppError);
  });
});

describe('requireRole', () => {
  it('permite cuando el rol autenticado está en la lista permitida', () => {
    expect(() =>
      requireRole({ sub: 's', email: undefined, roles: ['admin'] }, ['admin']),
    ).not.toThrow();
  });

  it('lanza FORBIDDEN cuando el rol autenticado no está permitido', () => {
    expect(() => requireRole({ sub: 's', email: undefined, roles: ['member'] }, ['admin'])).toThrow(
      AppError,
    );
  });
});
