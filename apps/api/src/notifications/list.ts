// Orquestador de `GET /notifications` (US-041, docs/api/contratos-api.md §8,
// criterios 1/2/5). La bandeja es siempre la del socio autenticado: el
// `memberId` se resuelve desde el `cognitoSub` del token (RN-NOT-01), nunca
// desde un parámetro del cliente.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { InboxNotification, Paginated } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import { listInbox } from './repository';

export interface ListNotificationsInput {
  cognitoSub: string;
  unreadOnly?: boolean;
  cursor?: string;
  limit?: number;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

export async function listNotifications(
  input: ListNotificationsInput,
): Promise<Paginated<InboxNotification>> {
  const client = input.client ?? getDocumentClient();

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  return listInbox(client, member.memberId, {
    ...(input.unreadOnly !== undefined ? { unreadOnly: input.unreadOnly } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  });
}
