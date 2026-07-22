import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyActivationMock = vi.fn();
vi.mock('../../activation/verify', () => ({ verifyActivation: verifyActivationMock }));

const { buildProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./verify');

describe('POST /activation/verify', () => {
  beforeEach(() => {
    verifyActivationMock.mockReset();
  });

  it('devuelve 200 con elegibilidad y datos mínimos para un DNI válido (criterio 1)', async () => {
    verifyActivationMock.mockResolvedValue({
      eligible: true,
      memberId: '01J000000000000000000TEST',
      firstName: 'María',
      maskedEmail: 'm***@example.com',
    });

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/verify',
      body: JSON.stringify({ dni: '45678912' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body) as { eligible: boolean; maskedEmail: string };
    expect(body).toEqual({
      eligible: true,
      memberId: '01J000000000000000000TEST',
      firstName: 'María',
      maskedEmail: 'm***@example.com',
    });
    expect(verifyActivationMock).toHaveBeenCalledWith({ request: { dni: '45678912' } });
  });

  it('devuelve 400 VALIDATION_ERROR con un DNI inválido, sin invocar verifyActivation', async () => {
    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/verify',
      body: JSON.stringify({ dni: '123' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(verifyActivationMock).not.toHaveBeenCalled();
  });

  it('propaga 404 DNI_NOT_FOUND de verifyActivation (criterio 2)', async () => {
    verifyActivationMock.mockRejectedValue(
      new AppError('DNI_NOT_FOUND', 'No se encontró un socio migrado con este DNI.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/verify',
      body: JSON.stringify({ dni: '45678912' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('DNI_NOT_FOUND');
  });

  it('propaga 409 ALREADY_ACTIVATED de verifyActivation (criterio 3)', async () => {
    verifyActivationMock.mockRejectedValue(
      new AppError('ALREADY_ACTIVATED', 'Este socio ya activó su cuenta digital.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/verify',
      body: JSON.stringify({ dni: '45678912' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_ACTIVATED');
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/verify',
      body: null,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});
