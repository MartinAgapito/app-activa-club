// Persistencia de la activación de un socio migrado (RN-ACT-01/02/03,
// docs/data/modelo-dynamodb.md §3.1/3.2/3.3, patrones #2/#7). A diferencia de
// la migración (../migration/repository.ts) y el registro
// (../registration/repository.ts), aquí el `Member` **ya existe** (creado por
// US-012): el enlace de la cuenta digital es un `UpdateItem` sobre ese ítem,
// nunca un `PutItem` nuevo, para preservar sus atributos de migración
// (`legacyId`, membresía, saldo pendiente, etc.). Solo el ítem `UniqueEmail`
// es nuevo (el socio migrado no tenía uno).

import {
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import type { ActivationUpdateValues } from './transform';

const UNIQUENESS_CONDITION = 'attribute_not_exists(PK)';
// Evita una doble activación por una carrera entre dos solicitudes
// concurrentes con el mismo DNI: solo se actualiza un `Member` que siga
// `MIGRATED` y sin `cognitoSub` enlazado (mismo criterio que
// `isEligibleMigratedMember`, ./transform.ts).
const MIGRATED_ELIGIBLE_CONDITION = 'memberStatus = :migratedStatus AND cognitoSub = :nullValue';

/** Ítem `Member` completo, tal como se lee de DynamoDB. */
export interface MemberRecord extends Member {
  PK: string;
  SK: string;
}

interface CancellationReasonLike {
  Code?: string;
}

interface TransactionCanceledExceptionLike extends Error {
  CancellationReasons?: CancellationReasonLike[];
}

/** Indica si la `TransactWriteItems` falló por la condición del ítem en `index`. */
function conditionFailedAt(error: unknown, index: number): boolean {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return false;
  const reasons = (error as TransactionCanceledExceptionLike).CancellationReasons;
  return reasons?.[index]?.Code === 'ConditionalCheckFailed';
}

/** Lectura por clave exacta vía `Query` (no `GetItem`): mismo patrón que `../registration/repository.ts`. */
async function getItemByKey<T>(
  client: DynamoDBDocumentClient,
  key: { PK: string; SK: string },
): Promise<T | undefined> {
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: { ':pk': key.PK, ':sk': key.SK },
      Limit: 1,
    }),
  );
  return result.Items?.[0] as T | undefined;
}

/** Resuelve el `memberId` asociado a un DNI (ítem `UniqueDni`, modelo-dynamodb.md §3.2, patrón #2). */
export async function findMemberIdByDni(
  client: DynamoDBDocumentClient,
  dni: string,
): Promise<string | undefined> {
  const item = await getItemByKey<{ memberId: string }>(client, keys.uniqueDni(dni));
  return item?.memberId;
}

/** Obtiene el ítem `Member` completo por `memberId` (§3.1, patrón #1). */
export function getMemberById(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<MemberRecord | undefined> {
  return getItemByKey<MemberRecord>(client, keys.member(memberId));
}

/** Verificación previa (best-effort, no atómica) de unicidad de correo; igual que en el registro. */
export async function isEmailRegistered(
  client: DynamoDBDocumentClient,
  emailLower: string,
): Promise<boolean> {
  const item = await getItemByKey(client, keys.uniqueEmail(emailLower));
  return item !== undefined;
}

export type CompleteActivationOutcome = 'ACTIVATED' | 'EMAIL_CONFLICT' | 'ALREADY_ACTIVATED';

export interface CompleteActivationWriteInput {
  memberId: string;
  emailLower: string;
  values: ActivationUpdateValues;
}

/**
 * Enlaza el usuario Cognito recién creado al socio migrado en una única
 * transacción: crea el ítem `UniqueEmail` (condicionado a que no exista) y
 * actualiza el `Member` ya existente (condicionado a que siga elegible). Si
 * cualquiera de las dos condiciones falla, se traduce al conflicto específico
 * para que el llamante responda con el código exacto del contrato
 * (`EMAIL_ALREADY_USED` / `ALREADY_ACTIVATED`, docs/api/contratos-api.md §3).
 */
export async function completeActivationWrite(
  client: DynamoDBDocumentClient,
  input: CompleteActivationWriteInput,
): Promise<CompleteActivationOutcome> {
  const table = tableName();
  const uniqueEmailItem = {
    ...keys.uniqueEmail(input.emailLower),
    entityType: 'UniqueEmail' as const,
    memberId: input.memberId,
  };

  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: uniqueEmailItem,
              ConditionExpression: UNIQUENESS_CONDITION,
            },
          },
          {
            Update: {
              TableName: table,
              Key: keys.member(input.memberId),
              ConditionExpression: MIGRATED_ELIGIBLE_CONDITION,
              UpdateExpression:
                'SET cognitoSub = :cognitoSub, memberStatus = :memberStatus, ' +
                'membershipStatus = :membershipStatus, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk, ' +
                'GSI2PK = :gsi2pk, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':migratedStatus': 'MIGRATED',
                ':nullValue': null,
                ':cognitoSub': input.values.cognitoSub,
                ':memberStatus': input.values.memberStatus,
                ':membershipStatus': input.values.membershipStatus,
                ':gsi1pk': input.values.GSI1PK,
                ':gsi1sk': input.values.GSI1SK,
                ':gsi2pk': input.values.GSI2PK,
                ':updatedAt': input.values.updatedAt,
              },
            },
          },
        ],
      }),
    );
    return 'ACTIVATED';
  } catch (error) {
    if (conditionFailedAt(error, 0)) return 'EMAIL_CONFLICT';
    if (conditionFailedAt(error, 1)) return 'ALREADY_ACTIVATED';
    throw error;
  }
}
