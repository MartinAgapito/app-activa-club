// Acceso a datos de `MaintenanceBlock` (US-035, docs/data/modelo-dynamodb.md
// §3.11): PK=`RESOURCE#<resourceId>`, SK=`MAINT#<startsAt>#<blockId>`,
// GSI3PK=`RESOURCE#<resourceId>` / GSI3SK=`SLOT#<startsAt>#<blockId>` (mismo
// índice que las reservas, así que `findResourceOccupancy`
// (`../reservations/repository.ts`) ya lo considera sin cambios).

import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { MaintenanceBlock } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

interface MaintenanceBlockItem extends MaintenanceBlock {
  PK: string;
  SK: string;
  GSI3PK: string;
  GSI3SK: string;
  entityType: 'MaintenanceBlock';
}

function buildMaintenanceBlockItem(block: MaintenanceBlock): MaintenanceBlockItem {
  return {
    ...block,
    ...keys.maintenanceBlock(block.resourceId, block.startsAt, block.blockId),
    ...keys.reservationsByResource(block.resourceId),
    GSI3SK: `SLOT#${block.startsAt}#${block.blockId}`,
    entityType: 'MaintenanceBlock',
  };
}

function toMaintenanceBlock(item: Record<string, unknown>): MaintenanceBlock {
  const raw = item as unknown as MaintenanceBlock;
  return {
    blockId: raw.blockId,
    resourceId: raw.resourceId,
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    reason: raw.reason,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt,
  };
}

/** Persiste un bloqueo (`PutItem`). `blockId` es un ULID nuevo, no debería colisionar. */
export async function putMaintenanceBlock(
  client: DynamoDBDocumentClient,
  block: MaintenanceBlock,
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName(),
      Item: buildMaintenanceBlockItem(block),
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

/**
 * Localiza un bloqueo por `resourceId` + `blockId`. La ruta del contrato no
 * trae `startsAt`, que forma parte de la SK (`MAINT#<startsAt>#<blockId>`),
 * así que no hay `GetItem` posible: se hace una `Query` sobre la tabla base
 * (PK=`RESOURCE#<id>`, `begins_with(SK,"MAINT#")`) filtrando por `blockId`.
 * La partición de un recurso es acotada (reservas + bloqueos de un recurso
 * fijo); se sigue `LastEvaluatedKey` hasta agotarla o encontrarlo.
 */
export async function findMaintenanceBlock(
  client: DynamoDBDocumentClient,
  resourceId: string,
  blockId: string,
): Promise<MaintenanceBlock | undefined> {
  const pk = keys.resource(resourceId).PK;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'blockId = :blockId',
        ExpressionAttributeValues: { ':pk': pk, ':prefix': 'MAINT#', ':blockId': blockId },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const item = result.Items?.[0];
    if (item) return toMaintenanceBlock(item);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return undefined;
}

/**
 * Elimina el bloqueo con `DeleteItem` condicionado a `attribute_exists(PK)`:
 * si dos administradores lo liberan a la vez, solo uno gana (criterio 7).
 * Devuelve `false` si el ítem ya no existía.
 */
export async function deleteMaintenanceBlock(
  client: DynamoDBDocumentClient,
  block: MaintenanceBlock,
): Promise<boolean> {
  try {
    await client.send(
      new DeleteCommand({
        TableName: tableName(),
        Key: keys.maintenanceBlock(block.resourceId, block.startsAt, block.blockId),
        ConditionExpression: 'attribute_exists(PK)',
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
    throw error;
  }
}
