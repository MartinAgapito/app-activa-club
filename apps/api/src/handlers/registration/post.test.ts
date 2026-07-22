import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerMemberMock = vi.fn();
vi.mock('../../registration/register', () => ({ registerMember: registerMemberMock }));

const { buildProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./post');

const validBody = {
  dni: '10203040',
  email: 'nuevo@example.com',
  password: 'Sup3rSecreta!',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '999000111',
};

describe('POST /registration', () => {
  beforeEach(() => {
    registerMemberMock.mockReset();
  });

  it('devuelve 201 con memberId y memberStatus PENDING para datos válidos (criterio 1)', async () => {
    registerMemberMock.mockResolvedValue({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'PENDING',
    });

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/registration',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body) as { memberId: string; memberStatus: string };
    expect(body).toEqual({ memberId: '01J000000000000000000TEST', memberStatus: 'PENDING' });
    expect(registerMemberMock).toHaveBeenCalledTimes(1);
    const callArg = registerMemberMock.mock.calls[0]?.[0] as { request: unknown };
    expect(callArg.request).toEqual(validBody);
  });

  it('omite phone del request cuando no se envía (DTO opcional, exactOptionalPropertyTypes)', async () => {
    registerMemberMock.mockResolvedValue({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'PENDING',
    });
    const { phone: _phone, ...withoutPhone } = validBody;

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/registration',
      body: JSON.stringify(withoutPhone),
    });

    await handler(event);

    const callArg = registerMemberMock.mock.calls[0]?.[0] as { request: Record<string, unknown> };
    expect('phone' in callArg.request).toBe(false);
  });

  it('devuelve 400 VALIDATION_ERROR con datos inválidos, sin invocar registerMember (criterio 3)', async () => {
    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/registration',
      body: JSON.stringify({ ...validBody, dni: '123', email: 'no-es-un-correo' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string; details?: unknown[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(registerMemberMock).not.toHaveBeenCalled();
  });

  it('propaga 409 DNI_ALREADY_USED de registerMember (criterio 2)', async () => {
    registerMemberMock.mockRejectedValue(
      new AppError('DNI_ALREADY_USED', 'Ya existe una cuenta asociada a este DNI.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/registration',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('DNI_ALREADY_USED');
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildProxyEvent({ httpMethod: 'POST', path: '/registration', body: null });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});
