import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupMemberByDniMock = vi.fn();
vi.mock('../../members/lookup', () => ({ lookupMemberByDni: lookupMemberByDniMock }));

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
    path: '/members/lookup',
    queryStringParameters: overrides.queryStringParameters ?? { dni: '45678912' },
    claims: overrides.claims ?? { sub: 'member-sub', 'cognito:groups': '[member]' },
  });
}

describe('GET /members/lookup', () => {
  beforeEach(() => {
    lookupMemberByDniMock.mockReset();
  });

  it('devuelve 200 con memberId/firstName/lastName (criterio 14)', async () => {
    lookupMemberByDniMock.mockResolvedValue({
      memberId: 'member-1',
      firstName: 'María',
      lastName: 'Quispe',
    });

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      memberId: 'member-1',
      firstName: 'María',
      lastName: 'Quispe',
    });
    expect(lookupMemberByDniMock).toHaveBeenCalledWith({ dni: '45678912' });
  });

  it('acepta el rol admin además de member', async () => {
    lookupMemberByDniMock.mockResolvedValue({
      memberId: 'member-1',
      firstName: 'María',
      lastName: 'Quispe',
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
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('devuelve 401 sin identidad autenticada', async () => {
    const event = buildEvent();
    (event.requestContext.authorizer as { claims?: unknown }).claims = undefined;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si falta dni en el query', async () => {
    const result = await handler(buildEvent({ queryStringParameters: {} }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('devuelve 400 VALIDATION_ERROR si el dni no cumple el formato (criterio 14)', async () => {
    const result = await handler(buildEvent({ queryStringParameters: { dni: '123' } }));

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('propaga 404 DNI_NOT_FOUND desde el orquestador (criterio 14)', async () => {
    lookupMemberByDniMock.mockRejectedValue(
      new AppError('DNI_NOT_FOUND', 'No se encontró un socio con este DNI.'),
    );

    const result = await handler(buildEvent());

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('DNI_NOT_FOUND');
  });
});
