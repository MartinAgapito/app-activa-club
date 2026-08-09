import { describe, expect, it } from 'vitest';

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./get-plans');

describe('GET /memberships/plans', () => {
  it('devuelve 401/403 si no hay identidad autenticada válida', async () => {
    const event = buildCognitoProxyEvent({
      path: '/memberships/plans',
      claims: { sub: 'test-sub', 'cognito:groups': '[]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
  });

  it('devuelve los planes MONTHLY y ANNUAL para un member autenticado', async () => {
    const event = buildCognitoProxyEvent({
      path: '/memberships/plans',
      claims: { sub: 'test-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);
    const body = JSON.parse(result.body) as {
      plans: { type: string; amount: number; currency: string; label: string }[];
    };

    expect(result.statusCode).toBe(200);
    expect(body.plans.map((plan) => plan.type)).toEqual(['MONTHLY', 'ANNUAL']);
    expect(body.plans.every((plan) => plan.currency === 'PEN')).toBe(true);
  });

  it('tambien permite el acceso a un admin (solo lectura de verificación)', async () => {
    const event = buildCognitoProxyEvent({
      path: '/memberships/plans',
      claims: { sub: 'test-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
  });
});
