// Persistencia idempotente de un socio migrado (docs/data/mapeo-migracion.md §2/§4).
//
// Cada socio se escribe en una única `TransactWriteItems` con condición
// `attribute_not_exists(PK)` sobre los ítems de unicidad de DNI y email: si el
// socio ya fue migrado en una ejecución previa, la transacción falla por la
// condición y se interpreta como "omitido" (RT-10), sin duplicar datos.

import { TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { tableName } from '../lib/dynamo';
import type { TransformedLegacyMember } from './transform';

export type MigrationWriteOutcome = 'MIGRATED' | 'SKIPPED_ALREADY_MIGRATED';

const UNIQUENESS_CONDITION = 'attribute_not_exists(PK)';

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TransactionCanceledException' ||
      error.name === 'ConditionalCheckFailedException')
  );
}

/**
 * Escribe los 4 ítems de un socio migrado (Member, UniqueDni, UniqueEmail,
 * MembershipPeriod) en una transacción. Idempotente: reejecutar con el mismo
 * DNI no duplica al socio (RN-ACT-03, RT-10).
 */
export async function writeMigratedMember(
  client: DynamoDBDocumentClient,
  items: TransformedLegacyMember,
): Promise<MigrationWriteOutcome> {
  const table = tableName();
  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: items.uniqueDni,
              ConditionExpression: UNIQUENESS_CONDITION,
            },
          },
          {
            Put: {
              TableName: table,
              Item: items.uniqueEmail,
              ConditionExpression: UNIQUENESS_CONDITION,
            },
          },
          { Put: { TableName: table, Item: items.member } },
          { Put: { TableName: table, Item: items.membershipPeriod } },
        ],
      }),
    );
    return 'MIGRATED';
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return 'SKIPPED_ALREADY_MIGRATED';
    }
    throw error;
  }
}
