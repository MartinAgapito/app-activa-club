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
  MembershipStatus,
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

/**
 * Activa o desactiva `autoRenew` directamente (US-023, criterios 6/7): a
 * diferencia de `payments/repository.ts` (que solo fija `autoRenew=true` en
 * el `Member` cuando un pago se confirma, y nunca lo desactiva), este camino
 * es simétrico y de efecto inmediato — puede tanto activar como desactivar la
 * preferencia sin pasar por el flujo de pago.
 */
export async function updateMemberAutoRenew(
  client: DynamoDBDocumentClient,
  memberId: string,
  enabled: boolean,
  now: string = new Date().toISOString(),
): Promise<Member> {
  const result = await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.member(memberId),
      ConditionExpression: 'attribute_exists(PK)',
      UpdateExpression: 'SET autoRenew = :autoRenew, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':autoRenew': enabled,
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
    // Socios anteriores a US-052 pueden no traer estos atributos: se normalizan
    // a los valores neutros del contrato (nunca `undefined` en la respuesta).
    membershipEndsAt: member.membershipEndsAt ?? null,
    outstandingBalance: member.outstandingBalance ?? 0,
    createdAt: member.createdAt,
  };
}

/** Lecturas internas máximas por petición con filtro secundario (contratos §12.1). */
export const MAX_FILTERED_READS = 5;
/** Ítems evaluados por lectura interna con filtro secundario (contratos §12.1). */
const FILTERED_READ_SIZE = 100;

export interface ListMembersByStatusOptions {
  cursor?: string;
  limit?: number;
  /**
   * Filtro adicional sobre la partición del estado (US-052, patrón #28,
   * ADR-0014). `DEBT` incluye `membershipStatus = DEBT` o
   * `outstandingBalance > 0`.
   */
  membershipStatus?: MembershipStatus;
}

function membershipFilter(membershipStatus: MembershipStatus): {
  FilterExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
} {
  if (membershipStatus === 'DEBT') {
    return {
      FilterExpression: '#ms = :ms OR #ob > :zero',
      ExpressionAttributeNames: { '#ms': 'membershipStatus', '#ob': 'outstandingBalance' },
      ExpressionAttributeValues: { ':ms': 'DEBT', ':zero': 0 },
    };
  }
  return {
    FilterExpression: '#ms = :ms',
    ExpressionAttributeNames: { '#ms': 'membershipStatus' },
    ExpressionAttributeValues: { ':ms': membershipStatus },
  };
}

/** Clave de continuación de GSI2 (PK/SK de tabla + GSI2PK/GSI2SK) de un ítem. */
function gsi2KeyOf(item: Record<string, unknown>): Record<string, unknown> {
  return { PK: item['PK'], SK: item['SK'], GSI2PK: item['GSI2PK'], GSI2SK: item['GSI2SK'] };
}

/**
 * Variante con filtro secundario (contratos §12.1): `Limit` de DynamoDB se
 * aplica antes del filtro, así que se encadenan hasta `MAX_FILTERED_READS`
 * lecturas de la partición. El cursor apunta al último elemento devuelto (no a
 * la última clave leída) para no saltar coincidencias; si se agota el
 * presupuesto sin llenar la página, se devuelve lo reunido con el cursor de la
 * última lectura (solo `nextCursor: null` indica el final).
 */
async function listMembersFiltered(
  client: DynamoDBDocumentClient,
  status: MemberStatus,
  membershipStatus: MembershipStatus,
  options: ListMembersByStatusOptions,
): Promise<Paginated<MemberSummary>> {
  const gsi2Key = keys.membersByStatus(status);
  const filter = membershipFilter(membershipStatus);
  const pageSize = options.limit ?? DEFAULT_PAGE_SIZE;
  const matches: Record<string, unknown>[] = [];
  let startKey = decodeCursor(options.cursor);

  for (let read = 0; read < MAX_FILTERED_READS; read += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        FilterExpression: filter.FilterExpression,
        ExpressionAttributeNames: filter.ExpressionAttributeNames,
        ExpressionAttributeValues: { ':pk': gsi2Key.GSI2PK, ...filter.ExpressionAttributeValues },
        Limit: FILTERED_READ_SIZE,
        ExclusiveStartKey: startKey,
      }),
    );
    matches.push(...((result.Items ?? []) as Record<string, unknown>[]));
    const lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    if (matches.length > pageSize) {
      const page = matches.slice(0, pageSize);
      const lastReturned = page[pageSize - 1] as Record<string, unknown>;
      return {
        items: page.map(toMemberSummary),
        nextCursor: encodeCursor(gsi2KeyOf(lastReturned)),
      };
    }
    // Página llena (o partición agotada) o presupuesto de lecturas consumido.
    if (matches.length === pageSize || lastKey === undefined || read === MAX_FILTERED_READS - 1) {
      return { items: matches.map(toMemberSummary), nextCursor: encodeCursor(lastKey) };
    }
    startKey = lastKey;
  }

  // Inalcanzable: la última iteración siempre retorna; satisface al compilador.
  return { items: matches.map(toMemberSummary), nextCursor: null };
}

/**
 * Lista socios por `memberStatus` (GSI2, patrón de acceso #14; RN-ADM-02),
 * paginado por cursor opaco (docs/api/contratos-api.md §1). Hoy solo se
 * implementa el patrón de acceso por estado: no existe un índice para listar
 * *todos* los socios sin filtro (evita un `Scan` completo de la tabla), así
 * que `status` es obligatorio para este listado (impuesto por el llamante).
 * Con `membershipStatus` aplica el patrón #28 (US-052): `Query` de la misma
 * partición con `FilterExpression`, sin `Scan` ni índice nuevo.
 */
export async function listMembersByStatus(
  client: DynamoDBDocumentClient,
  status: MemberStatus,
  options: ListMembersByStatusOptions = {},
): Promise<Paginated<MemberSummary>> {
  if (options.membershipStatus !== undefined) {
    return listMembersFiltered(client, status, options.membershipStatus, options);
  }
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
 *
 * Además de `memberStatus`, actualiza `GSI2PK` a `MEMBER#STATUS#<memberStatus>`
 * (modelo-dynamodb.md §3.1, patrón #14): sin este `SET` el socio queda mal
 * indexado y `GET /members?status=` deja de encontrarlo bajo su nuevo estado
 * (sigue apareciendo bajo `PENDING`). `GSI2SK` no se toca: conserva
 * `<createdAt>#<memberId>` fijado en el alta (registro/migración), que no
 * depende del estado.
 */
export async function transitionMemberStatus(
  client: DynamoDBDocumentClient,
  memberId: string,
  input: TransitionMemberStatusInput,
  now: string = new Date().toISOString(),
): Promise<Member | MemberTransitionOutcome> {
  const isRejection = input.to === 'REJECTED';
  const gsi2pk = keys.membersByStatus(input.to).GSI2PK;
  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: keys.member(memberId),
        ConditionExpression: 'attribute_exists(PK) AND memberStatus = :pending',
        UpdateExpression: isRejection
          ? 'SET memberStatus = :status, GSI2PK = :gsi2pk, rejectionReason = :reason, updatedAt = :now'
          : 'SET memberStatus = :status, GSI2PK = :gsi2pk, updatedAt = :now',
        ExpressionAttributeValues: {
          ':pending': 'PENDING',
          ':status': input.to,
          ':gsi2pk': gsi2pk,
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
