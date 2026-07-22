// Acceso a datos del socio autenticado (`Member`, docs/data/modelo-dynamodb.md
// §3.1). Compartido por GET y PATCH /members/me (docs/api/contratos-api.md §4;
// US-009 para la lectura, US-018 para la escritura de contacto): ambos
// resuelven el socio por `cognitoSub` vía GSI1 (patrón de acceso #11).

import { QueryCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member, UpdateMemberRequest } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

/**
 * Resuelve el `Member` completo enlazado a un `cognitoSub` (GSI1, proyección
 * `ALL`: no hace falta un segundo `GetItem` por `memberId`).
 */
export async function findMemberByCognitoSub(
  client: DynamoDBDocumentClient,
  cognitoSub: string,
): Promise<Member | undefined> {
  const gsi1Key = keys.memberByCognitoSub(cognitoSub);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
      ExpressionAttributeValues: { ':pk': gsi1Key.GSI1PK, ':sk': gsi1Key.GSI1SK },
      Limit: 1,
    }),
  );

  // TODO(Sprint 1): validar la forma del item leído contra un esquema propio
  // de acceso a datos antes de confiar en el cast, en vez de asumirlo (mismo
  // riesgo ya señalado en el handler de referencia US-009).
  const item = result.Items?.[0];
  return item ? (item as unknown as Member) : undefined;
}

/**
 * Actualiza únicamente los datos de contacto editables del socio (US-018,
 * RN-ACT-02/03: el DNI y el correo de identidad no se editan por este camino,
 * ni tampoco `memberStatus`/`membershipStatus`). Hoy el único campo editable
 * del contrato es `phone` (docs/api/contratos-api.md §4); si se habilita otro
 * campo editable, debe declararse primero en `UpdateMemberRequest`/
 * `updateMemberSchema` y reflejarse después aquí.
 *
 * `ConditionExpression: attribute_exists(PK)` es defensivo: `memberId` viene
 * de una lectura previa por `cognitoSub` (`findMemberByCognitoSub`), así que
 * el ítem debería existir siempre; evita crear un ítem nuevo por accidente
 * si de todos modos llegara a faltar.
 */
export async function updateMemberContact(
  client: DynamoDBDocumentClient,
  memberId: string,
  updates: UpdateMemberRequest,
  now: string = new Date().toISOString(),
): Promise<Member> {
  const result = await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.member(memberId),
      ConditionExpression: 'attribute_exists(PK)',
      UpdateExpression: 'SET phone = :phone, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':phone': updates.phone ?? null,
        ':updatedAt': now,
      },
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as unknown as Member;
}
