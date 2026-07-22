// Acceso a datos del socio (`Member`, docs/data/modelo-dynamodb.md §3.1).
// Compartido por varios endpoints de `docs/api/contratos-api.md §4`:
// - GET/PATCH /members/me (US-009/US-018): resuelven el socio por
//   `cognitoSub` vía GSI1 (patrón de acceso #1).
// - GET /members?status= / GET /members/{memberId} / approve / reject
//   (US-017): listan por estado vía GSI2 (patrón de acceso #14) o leen/
//   transicionan por `memberId` (patrón de acceso #1).

import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  Member,
  MemberStatus,
  MemberSummary,
  Paginated,
  UpdateMemberRequest,
} from '@activa-club/shared-types';

import { decodeCursor, encodeCursor } from '../lib/cursor';
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

/** Tamaño de página por defecto para listados administrativos paginados (US-017). */
const DEFAULT_PAGE_SIZE = 20;

/** Adapta un ítem `Member` crudo a la vista resumida `MemberSummary` del listado
 * administrativo (docs/api/contratos-api.md §4): expone solo los campos
 * necesarios para decidir, sin filtrar `cognitoSub`/`rejectionReason`/etc. */
function toMemberSummary(item: unknown): MemberSummary {
  // TODO(Sprint 1): mismo riesgo señalado en `findMemberByCognitoSub` — validar
  // la forma del ítem leído contra un esquema propio de acceso a datos antes
  // de confiar en el cast.
  const member = item as unknown as Member;
  return {
    memberId: member.memberId,
    dni: member.dni,
    firstName: member.firstName,
    lastName: member.lastName,
    origin: member.origin,
    memberStatus: member.memberStatus,
    membershipStatus: member.membershipStatus,
    createdAt: member.createdAt,
  };
}

export interface ListMembersByStatusOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Lista socios por `memberStatus` (GSI2, patrón de acceso #14; RN-ADM-02),
 * paginado por cursor opaco (docs/api/contratos-api.md §1). Hoy solo se
 * implementa el patrón de acceso por estado: no existe un índice para listar
 * *todos* los socios sin filtro (evita un `Scan` completo de la tabla), así
 * que `status` es obligatorio para este listado (impuesto por el llamante).
 */
export async function listMembersByStatus(
  client: DynamoDBDocumentClient,
  status: MemberStatus,
  options: ListMembersByStatusOptions = {},
): Promise<Paginated<MemberSummary>> {
  const gsi2Key = keys.membersByStatus(status);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi2Key.GSI2PK },
      Limit: options.limit ?? DEFAULT_PAGE_SIZE,
      ExclusiveStartKey: decodeCursor(options.cursor),
    }),
  );

  return {
    items: (result.Items ?? []).map(toMemberSummary),
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}

/** Resuelve el `Member` completo por su `memberId` (patrón de acceso #1). */
export async function getMemberById(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<Member | undefined> {
  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.member(memberId) }),
  );
  return result.Item ? (result.Item as unknown as Member) : undefined;
}

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

export type MemberTransitionOutcome = 'NOT_PENDING';

export interface TransitionMemberStatusInput {
  to: 'APPROVED' | 'REJECTED';
  /** Obligatorio (y usado) solo cuando `to === 'REJECTED'` (RN-ADM-02). */
  rejectionReason?: string;
}

/**
 * Transiciona `PENDING -> APPROVED|REJECTED` (US-017, RN-ACT-06, RN-ADM-02)
 * con una única `UpdateItem` condicionada a `memberStatus = PENDING`: la
 * propia condición atómica de DynamoDB decide la carrera entre dos admins
 * actuando sobre la misma solicitud (sin lectura-luego-escritura para la
 * transición en sí). Si la condición falla — porque el ítem no existe o ya no
 * está en `PENDING` — devuelve `'NOT_PENDING'`; el llamante decide 404 vs 409
 * apoyándose en una lectura previa (`getMemberById`) solo para diagnosticar el
 * caso, nunca para decidir el propio `UpdateItem`.
 */
export async function transitionMemberStatus(
  client: DynamoDBDocumentClient,
  memberId: string,
  input: TransitionMemberStatusInput,
  now: string = new Date().toISOString(),
): Promise<Member | MemberTransitionOutcome> {
  const isRejection = input.to === 'REJECTED';
  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: keys.member(memberId),
        ConditionExpression: 'attribute_exists(PK) AND memberStatus = :pending',
        UpdateExpression: isRejection
          ? 'SET memberStatus = :status, rejectionReason = :reason, updatedAt = :now'
          : 'SET memberStatus = :status, updatedAt = :now',
        ExpressionAttributeValues: {
          ':pending': 'PENDING',
          ':status': input.to,
          ':now': now,
          ...(isRejection ? { ':reason': input.rejectionReason } : {}),
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return result.Attributes as unknown as Member;
  } catch (error) {
    if (isConditionalCheckFailure(error)) return 'NOT_PENDING';
    throw error;
  }
}
