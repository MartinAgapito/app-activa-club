// Manejo de errores consistente para toda la API (docs/api/contratos-api.md §1,
// ADR-0008). Toda Lambda debe lanzar `AppError` para errores esperados de
// dominio; cualquier otro error se traduce a `INTERNAL_ERROR` sin filtrar
// detalles internos al cliente.

import type { ApiErrorResponse, ErrorCode, ErrorDetail } from '@activa-club/shared-types';

/** Error de dominio con código estable de docs/api/contratos-api.md §1.3. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

/** Códigos de estado HTTP por código de error (docs/api/contratos-api.md §1.2/1.3). */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DNI_NOT_FOUND: 404,
  CONFLICT: 409,
  DNI_ALREADY_USED: 409,
  EMAIL_ALREADY_USED: 409,
  ALREADY_ACTIVATED: 409,
  PAYMENT_DUPLICATE: 409,
  RESERVATION_OVERLAP: 409,
  PARTICIPANT_OVERLAP: 409,
  RESOURCE_IN_MAINTENANCE: 409,
  RESERVATION_NOT_PENDING: 409,
  MEMBER_NOT_APPROVED: 422,
  PAYMENT_FAILED: 422,
  MEMBERSHIP_REQUIRED: 422,
  MEMBER_HAS_DEBT: 422,
  CAPACITY_EXCEEDED: 422,
  OUTSIDE_SCHEDULE: 422,
  CANCELLATION_TOO_LATE: 422,
  GUEST_MONTHLY_LIMIT: 429,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export function statusCodeFor(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}

/** Construye el cuerpo de error estándar de la API a partir de un `AppError`. */
export function buildErrorBody(error: AppError, requestId: string): ApiErrorResponse {
  return {
    error: {
      code: error.code,
      message: error.message,
      requestId,
      ...(error.details && error.details.length > 0 ? { details: error.details } : {}),
    },
  };
}

/**
 * Traduce cualquier error capturado en un handler al par (statusCode, body)
 * de la respuesta HTTP. Errores no esperados (`unknown`) se registran para
 * diagnóstico y se devuelven como `INTERNAL_ERROR` sin exponer detalles.
 */
export function toErrorResult(
  error: unknown,
  requestId: string,
): { statusCode: number; body: ApiErrorResponse } {
  if (error instanceof AppError) {
    return { statusCode: statusCodeFor(error.code), body: buildErrorBody(error, requestId) };
  }
  const internal = new AppError('INTERNAL_ERROR', 'Ocurrió un error interno inesperado.');
  return { statusCode: statusCodeFor(internal.code), body: buildErrorBody(internal, requestId) };
}
