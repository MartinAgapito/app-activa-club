// Orquestador de `POST /notifications/{notificationId}/read` (US-041,
// docs/api/contratos-api.md §8, criterios 3/4/5).
//
// - Idempotente: repetir la llamada sobre una ya leída responde éxito sin
//   cambiar `readAt` (el `UpdateItem` es condicional a `readStatus = UNREAD`).
// - Notificación ajena o inexistente: 404 `NOT_FOUND` indistinguible. La
//   búsqueda ocurre solo dentro de la partición del socio autenticado, así que
//   una notificación de otro socio simplemente "no existe" para este.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { InboxNotification } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import { findInboxItem, markInboxItemRead } from './repository';

export interface ReadNotificationInput {
  cognitoSub: string;
  notificationId: string;
  /** Reloj inyectable (pruebas); por defecto `new Date()`. */
  now?: () => Date;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

function notFound(): AppError {
  return new AppError('NOT_FOUND', 'No se encontró la notificación indicada.');
}

export async function readNotification(input: ReadNotificationInput): Promise<InboxNotification> {
  const client = input.client ?? getDocumentClient();

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) throw notFound();

  const item = await findInboxItem(client, member.memberId, input.notificationId);
  if (!item) throw notFound();

  const now = input.now ?? (() => new Date());
  const updated = await markInboxItemRead(
    client,
    member.memberId,
    item['createdAt'] as string,
    input.notificationId,
    now().toISOString(),
  );
  if (!updated) throw notFound();
  return updated;
}
