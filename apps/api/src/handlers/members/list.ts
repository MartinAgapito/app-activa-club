// GET /members?status=&cursor=&limit= — lista socios por estado, paginado por
// cursor (docs/api/contratos-api.md §4, docs/scrum/historias/US-017-aprobacion-rechazo-socios.md,
// RN-ADM-02). Solo `admin`.
//
// `status` es obligatorio: hoy solo existe el patrón de acceso GSI2 por
// estado (docs/data/modelo-dynamodb.md, patrón #14); listar sin filtro
// implicaría un `Scan` completo de la tabla, fuera de las normas de
// ingeniería del proyecto.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listMembersQuerySchema } from '@activa-club/validation';

import { getDocumentClient } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse, parseQuery } from '../../lib/http';
import { listMembersByStatus } from '../../members/repository';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleListMembers(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['admin']);

  const query = parseQuery(event.queryStringParameters, listMembersQuerySchema);
  if (!query.status) {
    throw new AppError(
      'VALIDATION_ERROR',
      'El parámetro status es obligatorio para listar socios.',
    );
  }

  const result = await listMembersByStatus(getDocumentClient(), query.status, {
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  });

  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_MEMBERS',
  handleListMembers,
);
