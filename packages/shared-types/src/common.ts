// Tipos transversales compartidos entre apps/web y apps/api.
// Reflejan el formato de error y las convenciones de docs/api/contratos-api.md.

/** Rol del usuario, alineado con los grupos de Cognito (ADR-0002). */
export type Role = 'member' | 'admin';

/** Fecha en formato ISO-8601 UTC (p. ej. "2026-07-09T15:00:00Z"). */
export type ISODateString = string;

/** Moneda soportada en el MVP (Culqi Perú). */
export type Currency = 'PEN';

/**
 * Códigos de error de dominio del contrato de API
 * (docs/api/contratos-api.md §1.3).
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'DNI_ALREADY_USED'
  | 'EMAIL_ALREADY_USED'
  | 'DNI_NOT_FOUND'
  | 'ALREADY_ACTIVATED'
  | 'MEMBER_NOT_APPROVED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_DUPLICATE'
  | 'MEMBERSHIP_REQUIRED'
  | 'MEMBER_HAS_DEBT'
  | 'RESERVATION_OVERLAP'
  | 'PARTICIPANT_OVERLAP'
  | 'CAPACITY_EXCEEDED'
  | 'GUEST_MONTHLY_LIMIT'
  | 'OUTSIDE_SCHEDULE'
  | 'RESOURCE_IN_MAINTENANCE'
  | 'CANCELLATION_TOO_LATE'
  | 'RESERVATION_NOT_PENDING'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Detalle opcional de un error de validación por campo. */
export interface ErrorDetail {
  field: string;
  issue: string;
}

/** Cuerpo de error estándar (ADR-0008). */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
  requestId: string;
}

/** Envoltura de respuesta de error de la API. */
export interface ApiErrorResponse {
  error: ApiError;
}

/** Respuesta paginada por cursor opaco. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
