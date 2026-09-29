import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupGuestByDniMock = vi.fn();
vi.mock('../../guests/lookup', () => ({ lookupGuestByDni: lookupGuestByDniMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./lookup');

function buildEvent(
  overrides: {
    queryStringParameters?: Record<string, string> | null;
    claims?: Record<string, string>;
  } = {},
) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/guests/lookup',
    queryStringParameters: overrides.queryStringParameters ?? { dni: '70605040' },
    claims: overrides.claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /guests/lookup', () => {
  beforeEach(() => {
    lookupGuestByDniMock.mockReset();
  });

  it('devuelve 200 con guestDni/firstName/lastName y ningún otro campo (criterio 15)', async () => {
    lookupGuestByDniMock.mockResolvedValue({
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as Record<string, unknown>;
    expect(body).toEqual({ guestDni: '70605040', firstName: 'Ana', lastName: 'Torres' });
    expect(Object.keys(body)).toEqual(['guestDni', 'firstName', 'lastName']);
    expect(lookupGuestByDniMock).toHaveBeenCalledWith({ dni: '70605040' });
  });

  it('acepta el rol admin además de member', async () => {
    lookupGuestByDniMock.mockResolvedValue({
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });

    const result = await handler(
      buildEvent({ claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' } }),
    );

    expect(result.statusCode).toBe(200);
  });

  it('devuelve 403 para un rol distinto de member/admin', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'x-sub', 'cognito:groups': '[unknown]' } }),
    );

    expect(result.statusCode).toBe(403);
    expect(lookupGuestByDniMock).not.toHaveBeenCalled();
  });

  it('devuelve 401 sin identidad autenticada', async () => {
    const event = buildEvent();
    (event.requestContext.authorizer as { claims?: unknown }).claims = undefined;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(lookupGuestByDniMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si falta dni en el query', async () => {
    const result = await handler(buildEvent({ queryStringParameters: {} }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(lookupGuestByDniMock).not.toHaveBeenCalled();
  });

  it('propaga 404 NOT_FOUND desde el orquestador (señal de invitado nuevo, criterio 15)', async () => {
    lookupGuestByDniMock.mockRejectedValue(
      new AppError('NOT_FOUND', 'Este DNI todavía no fue invitado.'),
    );

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
