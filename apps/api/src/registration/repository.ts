// Persistencia de un socio nuevo (RN-ACT-03/05, docs/data/modelo-dynamodb.md
// §3.1/3.2/3.3, patrones #2/#7). Igual que la migración
// (../migration/repository.ts), la unicidad de DNI y correo se garantiza con
// una única `TransactWriteItems` condicionada a `attribute_not_exists(PK)`
// sobre los ítems `UniqueDni`/`UniqueEmail`: si cualquiera ya existe, la
// transacción completa falla y se traduce al conflicto correspondiente sin
// duplicar datos ni dejar ítems huérfanos en DynamoDB.

import {
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

import { keys, tableName } from '../lib/dynamo';
import type { TransformedNewMember } from './transform';

const UNIQUENESS_CONDITION = 'attribute_not_exists(PK)';

export type NewMemberWriteOutcome = 'CREATED' | 'DNI_CONFLICT' | 'EMAIL_CONFLICT';

interface CancellationReasonLike {
  Code?: string;
}

interface TransactionCanceledExceptionLike extends Error {
  CancellationReasons?: CancellationReasonLike[];
}

/** Indica si la `TransactWriteItems` falló por la condición de unicidad del ítem en `index`. */
function conditionFailedAt(error: unknown, index: number): boolean {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return false;
  const reasons = (error as TransactionCanceledExceptionLike).CancellationReasons;
  return reasons?.[index]?.Code === 'ConditionalCheckFailed';
}

async function existsByKey(
  client: DynamoDBDocumentClient,
  key: { PK: string; SK: string },
): Promise<boolean> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': key.PK, ':sk': key.SK },
      Limit: 1,
    }),
  );
  return (result.Items?.length ?? 0) > 0;
}

/**
 * Verificación previa (best-effort, no atómica) de si el DNI ya está
 * asociado a una cuenta. Permite responder rápido y con un error claro antes
 * de crear el usuario Cognito; la garantía real de unicidad (RN-ACT-03) la
 * da la condición de `writeNewMember`.
 */
export function isDniRegistered(client: DynamoDBDocumentClient, dni: string): Promise<boolean> {
  return existsByKey(client, keys.uniqueDni(dni));
}

/** Verificación previa equivalente para el correo (ver `isDniRegistered`). */
export function isEmailRegistered(
  client: DynamoDBDocumentClient,
  emailLower: string,
): Promise<boolean> {
  return existsByKey(client, keys.uniqueEmail(emailLower));
}

/**
 * Escribe los 3 ítems de un socio nuevo en una única transacción. Devuelve el
 * conflicto específico (DNI o correo) cuando la condición de unicidad falla,
 * para que el llamante responda con el código de error exacto del contrato
 * (`DNI_ALREADY_USED` / `EMAIL_ALREADY_USED`, docs/api/contratos-api.md §3).
 */
export async function writeNewMember(
  client: DynamoDBDocumentClient,
  items: TransformedNewMember,
): Promise<NewMemberWriteOutcome> {
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
        ],
      }),
    );
    return 'CREATED';
  } catch (error) {
    if (conditionFailedAt(error, 0)) return 'DNI_CONFLICT';
    if (conditionFailedAt(error, 1)) return 'EMAIL_CONFLICT';
    throw error;
  }
}
