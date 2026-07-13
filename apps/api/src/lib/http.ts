// Helpers HTTP para respuestas de API Gateway (formato REST, ADR-0004) y
// parseo/validación de entrada con Zod (packages/validation).

import type { APIGatewayProxyResult } from 'aws-lambda';
import type { ZodError, ZodType } from 'zod';

import { AppError } from './errors';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** Construye una respuesta JSON de API Gateway con el body serializado. */
export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

function zodErrorToDetails(error: ZodError): { field: string; issue: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(body)',
    issue: issue.message,
  }));
}

/**
 * Parsea y valida el body JSON de un evento de API Gateway contra un esquema
 * Zod de `packages/validation`. Lanza `AppError('VALIDATION_ERROR', ...)` si el
 * body no es JSON válido o no cumple el esquema (400, docs/api/contratos-api.md §1.2).
 */
export function parseJsonBody<T>(rawBody: string | null, schema: ZodType<T>): T {
  if (rawBody === null || rawBody.trim() === '') {
    throw new AppError('VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new AppError('VALIDATION_ERROR', 'El cuerpo de la solicitud no es JSON válido.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'La solicitud no cumple el formato esperado.',
      zodErrorToDetails(result.error),
    );
  }
  return result.data;
}

/** Valida query-string params (u otro objeto plano) contra un esquema Zod. */
export function parseQuery<T>(
  query: Record<string, string | undefined> | null,
  schema: ZodType<T>,
): T {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Los parámetros de consulta no cumplen el formato esperado.',
      zodErrorToDetails(result.error),
    );
  }
  return result.data;
}
