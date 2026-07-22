// GET /members/me — perfil propio del socio autenticado (docs/api/contratos-api.md §4).
//
// Handler de referencia (US-009): demuestra el patrón completo "Lambda por
// endpoint + middleware de auth + acceso a DynamoDB" que Sprint 1 debe
// replicar para el resto de endpoints `member`/`admin`. Solo lectura: no
// implementa reglas de negocio de escritura (activación, pagos, reservas),
// que quedan para las historias funcionales de Sprint 1+.
//
// La resolución del socio por `cognitoSub` (modelo-dynamodb.md §4, patrón
// #11) vive en `../../members/repository.ts`, compartida con
// PATCH /members/me (US-018) para no duplicar la misma consulta GSI1.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getDocumentClient } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse } from '../../lib/http';
import { findMemberByCognitoSub } from '../../members/repository';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleGetMe(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const member = await findMemberByCognitoSub(getDocumentClient(), identity.sub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  return jsonResponse(200, member);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_MEMBER_ME',
  handleGetMe,
);
