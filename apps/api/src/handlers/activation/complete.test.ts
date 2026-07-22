import { beforeEach, describe, expect, it, vi } from 'vitest';

const completeActivationMock = vi.fn();
vi.mock('../../activation/complete', () => ({ completeActivation: completeActivationMock }));

const { buildProxyEvent } = await import('../../testing/fixtures');
const { AppError } = await import('../../lib/errors');
const { handler } = await import('./complete');

const validBody = {
  dni: '45678912',
  email: 'maria@example.com',
  password: 'Sup3rSecreta!',
};

describe('POST /activation/complete', () => {
  beforeEach(() => {
    completeActivationMock.mockReset();
  });

  it('devuelve 201 con memberStatus/membershipStatus para datos válidos (criterio 4)', async () => {
    completeActivationMock.mockResolvedValue({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
    });

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body) as {
      memberId: string;
      memberStatus: string;
      membershipStatus: string;
    };
    expect(body).toEqual({
      memberId: '01J000000000000000000TEST',
      memberStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
    });
    expect(completeActivationMock).toHaveBeenCalledWith({ request: validBody });
  });

  it('devuelve 400 VALIDATION_ERROR con datos inválidos, sin invocar completeActivation', async () => {
    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: JSON.stringify({ ...validBody, dni: '123', email: 'no-es-un-correo' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string; details?: unknown[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(completeActivationMock).not.toHaveBeenCalled();
  });

  it('propaga 404 DNI_NOT_FOUND de completeActivation', async () => {
    completeActivationMock.mockRejectedValue(
      new AppError('DNI_NOT_FOUND', 'No se encontró un socio migrado con este DNI.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('DNI_NOT_FOUND');
  });

  it('propaga 409 ALREADY_ACTIVATED de completeActivation', async () => {
    completeActivationMock.mockRejectedValue(
      new AppError('ALREADY_ACTIVATED', 'Este socio ya activó su cuenta digital.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_ACTIVATED');
  });

  it('propaga 409 EMAIL_ALREADY_USED de completeActivation (criterio 5)', async () => {
    completeActivationMock.mockRejectedValue(
      new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.'),
    );

    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: JSON.stringify(validBody),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('EMAIL_ALREADY_USED');
  });

  it('devuelve 400 VALIDATION_ERROR si el body está vacío', async () => {
    const event = buildProxyEvent({
      httpMethod: 'POST',
      path: '/activation/complete',
      body: null,
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
  });
});
