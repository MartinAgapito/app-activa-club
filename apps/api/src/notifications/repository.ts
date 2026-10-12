// Persistencia de la bandeja del socio (`MemberNotification`,
// docs/data/modelo-dynamodb.md §3.13, patrón de acceso #5; US-041).
//
// Toda lectura/escritura es siempre dentro de la partición `MEMBER#<memberId>`
// del socio autenticado: el `memberId` lo resuelve el orquestador desde el
// `cognitoSub` del token, nunca desde la entrada del cliente (criterio 5).

import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { InboxNotification, NotificationEvent, Paginated } from '@activa-club/shared-types';

import { decodeCursor, encodeCursor } from '../lib/cursor';
import { keys, tableName } from '../lib/dynamo';

export const DEFAULT_NOTIFICATION_PAGE_SIZE = 20;

/** Tope de `Query` consecutivas al completar una página filtrada (acota el costo de lectura). */
const MAX_QUERIES_PER_PAGE = 5;

/** Tope de páginas leídas al buscar una notificación por id dentro de la bandeja de un socio. */
const MAX_QUERIES_FIND = 10;

export interface ListInboxOptions {
  unreadOnly?: boolean;
  cursor?: string;
  limit?: number;
}

function toInboxNotification(item: Record<string, unknown>): InboxNotification {
  return {
    notificationId: item['notificationId'] as string,
    title: item['title'] as string,
    body: item['body'] as string,
    event: (item['event'] as NotificationEvent | null | undefined) ?? null,
    readStatus: item['readStatus'] as InboxNotification['readStatus'],
    createdAt: item['createdAt'] as string,
    readAt: (item['readAt'] as string | null | undefined) ?? null,
  };
}

function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * Bandeja del socio, más reciente primero (patrón #5): `Query`
 * PK=`MEMBER#<id>`, `begins_with(SK,"NOTIF#")`, `ScanIndexForward: false`
 * (la SK es `NOTIF#<createdAt>#<notificationId>`).
 *
 * Con `unreadOnly`, el filtro `readStatus = UNREAD` se aplica **después** de
 * que DynamoDB lee `Limit` ítems, por lo que una sola `Query` puede devolver
 * menos de `limit` aunque queden más. Para que "Cargar más" nunca muestre una
 * página vacía con cursor, se encadenan `Query` (hasta `MAX_QUERIES_PER_PAGE`)
 * hasta completar `limit` o agotar la partición; si se junta de más, se
 * recorta a `limit` y el cursor se reconstruye desde la clave del último ítem
 * conservado.
 */
export async function listInbox(
  client: DynamoDBDocumentClient,
  memberId: string,
  options: ListInboxOptions = {},
): Promise<Paginated<InboxNotification>> {
  const limit = options.limit ?? DEFAULT_NOTIFICATION_PAGE_SIZE;
  const pk = keys.member(memberId).PK;
  const collected: Record<string, unknown>[] = [];
  let startKey = decodeCursor(options.cursor);
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let queries = 0;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ...(options.unreadOnly ? { FilterExpression: 'readStatus = :unread' } : {}),
        ExpressionAttributeValues: {
          ':pk': pk,
          ':prefix': 'NOTIF#',
          ...(options.unreadOnly ? { ':unread': 'UNREAD' } : {}),
        },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: startKey,
      }),
    );
    queries += 1;
    collected.push(...(result.Items ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    startKey = lastEvaluatedKey;
  } while (
    options.unreadOnly &&
    lastEvaluatedKey !== undefined &&
    collected.length < limit &&
    queries < MAX_QUERIES_PER_PAGE
  );

  if (collected.length > limit) {
    const kept = collected.slice(0, limit);
    const last = kept[limit - 1] as Record<string, unknown>;
    return {
      items: kept.map(toInboxNotification),
      nextCursor: encodeCursor({ PK: last['PK'], SK: last['SK'] }),
    };
  }

  return {
    items: collected.map(toInboxNotification),
    nextCursor: encodeCursor(lastEvaluatedKey),
  };
}

/**
 * Localiza una notificación **dentro de la partición del socio** por su
 * `notificationId`. La SK lleva `createdAt` delante del id, por lo que no se
 * puede construir la clave solo con el id: se consulta la partición del socio
 * filtrando por `notificationId` (nunca fuera de ella, así una notificación
 * ajena es indistinguible de una inexistente).
 */
export async function findInboxItem(
  client: DynamoDBDocumentClient,
  memberId: string,
  notificationId: string,
): Promise<Record<string, unknown> | null> {
  const pk = keys.member(memberId).PK;
  let startKey: Record<string, unknown> | undefined;
  for (let i = 0; i < MAX_QUERIES_FIND; i += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'notificationId = :id',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'NOTIF#', ':id': notificationId },
        ScanIndexForward: false,
        ExclusiveStartKey: startKey,
      }),
    );
    const found = result.Items?.[0];
    if (found) return found;
    startKey = result.LastEvaluatedKey;
    if (!startKey) return null;
  }
  return null;
}

/**
 * Marca como `READ` con `readAt`, de forma idempotente: la condición
 * `readStatus = UNREAD` hace que solo la primera llamada escriba; las
 * siguientes no alteran `readAt` (criterio 3). Devuelve el estado final del
 * ítem (el recién escrito, o el existente si ya estaba leído). `null` si el
 * ítem ya no existe.
 */
export async function markInboxItemRead(
  client: DynamoDBDocumentClient,
  memberId: string,
  createdAt: string,
  notificationId: string,
  readAt: string,
): Promise<InboxNotification | null> {
  const key = keys.memberNotification(memberId, createdAt, notificationId);
  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: key,
        UpdateExpression: 'SET readStatus = :read, readAt = :readAt',
        ConditionExpression: 'attribute_exists(PK) AND readStatus = :unread',
        ExpressionAttributeValues: { ':read': 'READ', ':readAt': readAt, ':unread': 'UNREAD' },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return result.Attributes ? toInboxNotification(result.Attributes) : null;
  } catch (error) {
    if (!isConditionalCheckFailed(error)) throw error;
  }

  // Ya estaba leída (o fue borrada): se devuelve el estado actual sin escribir.
  const current = await client.send(new GetCommand({ TableName: tableName(), Key: key }));
  return current.Item ? toInboxNotification(current.Item) : null;
}
