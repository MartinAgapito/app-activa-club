// Cliente HTTP base de Activa Club.
//
// Infraestructura genérica: NO implementa ningún flujo de negocio. Encapsula
// el formato de error estándar del contrato (docs/api/contratos-api.md §1.1)
// y la convención de autenticación (JWT de Cognito en `Authorization: Bearer`,
// ver ADR-0002). La obtención real del token contra Cognito es trabajo de
// Sprint 1 (`getAccessToken` es un placeholder inyectable).
//
// Sprint 0 (US-008): solo se define esta base. Ninguna pantalla la invoca
// todavía contra un backend real (ver criterio de aceptación 7 de US-008).

import type { ApiErrorResponse, ErrorCode } from '@activa-club/shared-types';

/** Prefijo /api documentado en docs/api/contratos-api.md §1. Sin valor por
 * defecto "mágico": si no se configura VITE_API_BASE_URL, las llamadas
 * fallan explícitamente en vez de apuntar a un backend inventado. */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/** Punto de extensión para inyectar el JWT de Cognito (Sprint 1). */
let accessTokenProvider: () => string | null = () => null;

export function setAccessTokenProvider(provider: () => string | null): void {
  accessTokenProvider = provider;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly details: ApiErrorResponse['error']['details'];
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    details?: ApiErrorResponse['error']['details'],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

/** Realiza una petición HTTP contra la API documentada y normaliza errores al
 * formato estándar del contrato. No decide reglas de negocio: solo transporte. */
export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const { body, headers, ...rest } = options;
  const token = accessTokenProvider();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor.');
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorPayload = payload as Partial<ApiErrorResponse> | null;
    const error = errorPayload?.error;
    throw new ApiRequestError(
      response.status,
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Ocurrió un error inesperado.',
      error?.details,
      error?.requestId,
    );
  }

  return payload as TResponse;
}
