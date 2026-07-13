import { describe, expect, it } from 'vitest';

import { AppError, buildErrorBody, statusCodeFor, toErrorResult } from './errors';

describe('statusCodeFor', () => {
  it('mapea códigos de dominio a status HTTP según docs/api/contratos-api.md §1.2', () => {
    expect(statusCodeFor('VALIDATION_ERROR')).toBe(400);
    expect(statusCodeFor('UNAUTHENTICATED')).toBe(401);
    expect(statusCodeFor('FORBIDDEN')).toBe(403);
    expect(statusCodeFor('DNI_NOT_FOUND')).toBe(404);
    expect(statusCodeFor('DNI_ALREADY_USED')).toBe(409);
    expect(statusCodeFor('MEMBER_HAS_DEBT')).toBe(422);
    expect(statusCodeFor('GUEST_MONTHLY_LIMIT')).toBe(429);
    expect(statusCodeFor('INTERNAL_ERROR')).toBe(500);
  });
});

describe('buildErrorBody', () => {
  it('incluye requestId y detalles cuando se proveen', () => {
    const error = new AppError('VALIDATION_ERROR', 'DNI inválido', [
      { field: 'dni', issue: 'Debe tener 8 dígitos' },
    ]);
    const body = buildErrorBody(error, 'req-123');
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.requestId).toBe('req-123');
    expect(body.error.details).toHaveLength(1);
  });

  it('omite `details` cuando no se proveen (contrato no exige la clave)', () => {
    const error = new AppError('NOT_FOUND', 'No encontrado');
    const body = buildErrorBody(error, 'req-1');
    expect(body.error.details).toBeUndefined();
  });
});

describe('toErrorResult', () => {
  it('traduce errores no controlados a INTERNAL_ERROR sin exponer el mensaje original', () => {
    const { statusCode, body } = toErrorResult(new Error('detalle interno sensible'), 'req-2');
    expect(statusCode).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).not.toContain('sensible');
  });

  it('preserva el AppError original', () => {
    const { statusCode, body } = toErrorResult(
      new AppError('DNI_NOT_FOUND', 'DNI no encontrado'),
      'req-3',
    );
    expect(statusCode).toBe(404);
    expect(body.error.code).toBe('DNI_NOT_FOUND');
  });
});
