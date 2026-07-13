// GET /members/me — perfil propio del socio autenticado (docs/api/contratos-api.md §4).
//
// Handler de referencia (US-009): demuestra el patrón completo "Lambda por
// endpoint + middleware de auth + acceso a DynamoDB" que Sprint 1 debe
// replicar para el resto de endpoints `member`/`admin`. Solo lectura: no
// implementa reglas de negocio de escritura (activación, pagos, reservas),
// que quedan para las historias funcionales de Sprint 1+.
//
// Patrón de acceso: modelo-dynamodb.md §4, patrón #11 (resolver socio por
// `cognitoSub` vía GSI1; la proyección `ALL` del índice devuelve el item
// `Member` completo sin necesidad de un segundo `GetItem`).

import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import type { Member } from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleGetMe(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const gsi1Key = keys.memberByCognitoSub(identity.sub);
  const result = await getDocumentClient().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': gsi1Key.GSI1PK, ':sk': gsi1Key.GSI1SK },
      Limit: 1,
    }),
  );

  const item = result.Items?.[0];
  if (!item) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  // TODO(Sprint 1): validar la forma del item leído contra un esquema propio
  // de acceso a datos antes de confiar en el cast, en vez de asumirlo.
  const member = item as unknown as Member;

  return jsonResponse(200, member);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_MEMBER_ME',
  handleGetMe,
);
