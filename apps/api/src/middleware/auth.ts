// Middleware de identidad y autorización por rol (ADR-0002, ADR-0004).
//
// API Gateway valida el JWT de Cognito con un Cognito Authorizer *antes* de
// invocar la Lambda; el claim `cognito:groups` (grupo `member` | `admin`)
// determina el rol. Cada handler debe llamar `extractIdentity` y, si la ruta
// no es pública, `requireRole` con los roles permitidos por
// docs/api/contratos-api.md. La autorización nunca depende del frontend.

import type { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import type { Role } from '@activa-club/shared-types';

import { AppError } from '../lib/errors';

export interface AuthenticatedIdentity {
  /** `sub` de Cognito; enlaza con `Member.cognitoSub` (GSI1, modelo-dynamodb.md §3.1). */
  sub: string;
  email: string | undefined;
  roles: Role[];
}

function isKnownRole(value: string): value is Role {
  return value === 'member' || value === 'admin';
}

/**
 * El authorizer Cognito de API Gateway serializa claims de tipo arreglo (como
 * `cognito:groups`) con el `toString()` del arreglo, p. ej. `"[admin]"` o
 * `"[admin, member]"`. Se normaliza aquí en vez de asumir CSV o JSON.
 */
function parseGroupsClaim(raw: string | undefined): string[] {
  if (!raw) return [];
  const withoutBrackets = raw.trim().replace(/^\[/, '').replace(/\]$/, '');
  return withoutBrackets
    .split(',')
    .map((group) => group.trim())
    .filter((group) => group.length > 0);
}

/** Extrae la identidad autenticada de un evento de API Gateway con Cognito Authorizer. */
export function extractIdentity(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): AuthenticatedIdentity {
  const claims: Record<string, string> | undefined = event.requestContext.authorizer?.claims;
  const sub = claims?.['sub'];
  if (!claims || !sub) {
    // No debería ocurrir en rutas protegidas por el authorizer; defensivo.
    throw new AppError('UNAUTHENTICATED', 'No se pudo resolver la identidad autenticada.');
  }
  return {
    sub,
    email: claims['email'],
    roles: parseGroupsClaim(claims['cognito:groups']).filter(isKnownRole),
  };
}

/** Verifica que la identidad tenga al menos uno de los roles permitidos. */
export function requireRole(identity: AuthenticatedIdentity, allowed: readonly Role[]): void {
  const authorized = identity.roles.some((role) => allowed.includes(role));
  if (!authorized) {
    throw new AppError('FORBIDDEN', 'No tiene permiso para realizar esta acción.');
  }
}
