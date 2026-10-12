// Orquestador de `GET /notifications/sent` (US-048, docs/api/contratos-api.md
// §8, RN-ANL-08): historial de lo publicado y de los avisos automáticos, de lo
// más reciente a lo más antiguo, paginado por cursor.
//
// Patrón de acceso #18: `Query` GSI2PK=`NOTIFICATION#SENT` (el rango es
// `<createdAt>#<notificationId>`), sin `Scan`. El origen no es un atributo
// persistido: se deriva de `createdBy` (`SYSTEM` = automático, EP-05 pregunta
// 13).

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  NotificationEvent,
  NotificationSegment,
  Paginated,
  SentNotification,
} from '@activa-club/shared-types';

import { decodeCursor, encodeCursor } from '../lib/cursor';
import { getDocumentClient, keys, tableName } from '../lib/dynamo';

export const DEFAULT_SENT_PAGE_SIZE = 20;

export interface ListSentNotificationsInput {
  cursor?: string | undefined;
  limit?: number | undefined;
  client?: DynamoDBDocumentClient | undefined;
}

function toSentNotification(item: Record<string, unknown>): SentNotification {
  const createdBy = item['createdBy'] as string;
  return {
    notificationId: item['notificationId'] as string,
    title: item['title'] as string,
    body: item['body'] as string,
    segment: (item['segment'] as NotificationSegment | null | undefined) ?? null,
    targetMemberId: (item['targetMemberId'] as string | null | undefined) ?? null,
    resourceId: (item['resourceId'] as string | null | undefined) ?? null,
    event: (item['event'] as NotificationEvent | null | undefined) ?? null,
    alsoEmail: item['alsoEmail'] === true,
    createdBy,
    recipientCount: (item['recipientCount'] as number | null | undefined) ?? null,
    createdAt: item['createdAt'] as string,
    origin: createdBy === 'SYSTEM' ? 'SYSTEM' : 'MANUAL',
  };
}

export async function listSentNotifications(
  input: ListSentNotificationsInput = {},
): Promise<Paginated<SentNotification>> {
  const client = input.client ?? getDocumentClient();
  const gsi2 = keys.notificationSent('', '');
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi2.GSI2PK },
      ScanIndexForward: false,
      Limit: input.limit ?? DEFAULT_SENT_PAGE_SIZE,
      ExclusiveStartKey: decodeCursor(input.cursor),
    }),
  );

  return {
    items: (result.Items ?? []).map(toSentNotification),
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}
