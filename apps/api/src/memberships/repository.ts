// Persistencia del proceso diario de vencimiento de membresías (US-038,
// docs/data/modelo-dynamodb.md §3.4 / §3.17, patrones #15 y #27).
//
// - Lectura: `Query` sobre GSI2 con GSI2PK=`MEMBERSHIP#ACTIVE` y rango
//   `endsAt` (patrón #15). Nunca un `Scan`.
// - Escritura por transición: una `TransactWriteItems` que (1) actualiza el
//   `Member` condicionada a la vigencia leída (criterio 7: no pisa una
//   renovación concurrente), (2) deja el rastro `MembershipTransition` para
//   US-047 (criterio 11) y (3) al pasar a `EXPIRED` retira el período de GSI2
//   (solo "vigente" va en ese índice, modelo-dynamodb.md §3.4).

import {
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { MembershipStatus } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import type { VigencyTransitionTarget } from './vigency';

/** Referencia a un `MembershipPeriod` presente en GSI2 (solo lo que el proceso necesita). */
export interface ActivePeriodRef {
  PK: string;
  SK: string;
  memberId: string;
  endsAt: string;
}

/** Ítem `MembershipTransition` (rastro para US-047, modelo-dynamodb.md §3.17). */
export const TRANSITION_PENDING_GSI2PK = 'MEMBERSHIP#TRANSITION#PENDING';

interface CancellationReasonLike {
  Code?: string;
}

interface TransactionCanceledExceptionLike extends Error {
  CancellationReasons?: CancellationReasonLike[];
}

function conditionFailedAt(error: unknown, index: number): boolean {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return false;
  const reasons = (error as TransactionCanceledExceptionLike).CancellationReasons;
  return reasons?.[index]?.Code === 'ConditionalCheckFailed';
}

function isConditionalCheckFailure(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

/**
 * Lista TODOS los períodos en GSI2 con `endsAt` anterior a `endsBeforeKey`
 * (comparación lexicográfica sobre `GSI2SK`), paginando con
 * `LastEvaluatedKey`. El llamante calcula `endsBeforeKey` con holgura para
 * cubrir instantes UTC cuya fecha de Lima es anterior (ver
 * `expire-memberships.ts`); la decisión exacta se toma luego sobre el `Member`.
 */
export async function listActivePeriodsEndingBefore(
  client: DynamoDBDocumentClient,
  endsBeforeKey: string,
): Promise<ActivePeriodRef[]> {
  const refs: ActivePeriodRef[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK < :before',
        ExpressionAttributeValues: {
          ':pk': keys.membershipsActive('').GSI2PK,
          ':before': endsBeforeKey,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    for (const item of result.Items ?? []) {
      const pk = String(item['PK'] ?? '');
      if (!pk.startsWith('MEMBER#')) continue;
      refs.push({
        PK: pk,
        SK: String(item['SK']),
        memberId: pk.slice('MEMBER#'.length),
        endsAt: String(item['GSI2SK']),
      });
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return refs;
}

export interface ApplyVigencyTransitionInput {
  memberId: string;
  from: MembershipStatus;
  to: VigencyTransitionTarget;
  /** `membershipEndsAt` leído: la escritura solo procede si sigue siendo el mismo (criterio 7). */
  membershipEndsAt: string;
  /** Período vigente en GSI2 a retirar al pasar a `EXPIRED` (si se conoce). */
  period?: { PK: string; SK: string } | undefined;
  /** Marca de tiempo ISO de la transición. */
  now: string;
}

export type ApplyVigencyTransitionOutcome = 'APPLIED' | 'STALE';

/**
 * Aplica una transición de vigencia de forma atómica y condicional. Devuelve
 * `STALE` (sin escribir nada) si el `Member` ya no tiene el estado/vigencia
 * leídos: p. ej. el socio renovó mientras corría el proceso. Idempotente: una
 * segunda ejecución no vuelve a ver al socio como candidato.
 */
export async function applyVigencyTransition(
  client: DynamoDBDocumentClient,
  input: ApplyVigencyTransitionInput,
): Promise<ApplyVigencyTransitionOutcome> {
  const table = tableName();
  const renewalEvent = input.to === 'EXPIRED' ? 'RENEWAL_OVERDUE' : 'RENEWAL_DUE';

  const transactItems: NonNullable<
    ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
  > = [
    {
      Update: {
        TableName: table,
        Key: keys.member(input.memberId),
        ConditionExpression:
          'attribute_exists(PK) AND membershipStatus = :from AND membershipEndsAt = :endsAt',
        UpdateExpression: 'SET membershipStatus = :to, updatedAt = :now',
        ExpressionAttributeValues: {
          ':from': input.from,
          ':to': input.to,
          ':endsAt': input.membershipEndsAt,
          ':now': input.now,
        },
      },
    },
    {
      Put: {
        TableName: table,
        Item: {
          PK: `MEMBER#${input.memberId}`,
          SK: `MEMBERSHIP_TRANSITION#${input.membershipEndsAt}#${input.to}`,
          GSI2PK: TRANSITION_PENDING_GSI2PK,
          GSI2SK: `${input.now}#${input.memberId}`,
          entityType: 'MembershipTransition',
          memberId: input.memberId,
          fromStatus: input.from,
          toStatus: input.to,
          membershipEndsAt: input.membershipEndsAt,
          event: renewalEvent,
          occurredAt: input.now,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
  ];

  if (input.to === 'EXPIRED' && input.period) {
    transactItems.push({
      Update: {
        TableName: table,
        Key: { PK: input.period.PK, SK: input.period.SK },
        ConditionExpression: 'attribute_exists(PK)',
        UpdateExpression: 'REMOVE GSI2PK, GSI2SK',
      },
    });
  }

  try {
    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return 'APPLIED';
  } catch (error) {
    if (conditionFailedAt(error, 0)) return 'STALE';
    throw error;
  }
}

/**
 * Retira de GSI2 un período reemplazado por una renovación (su `endsAt` es
 * anterior al `membershipEndsAt` actual del socio). Mantiene el índice solo con
 * períodos vigentes. Condicionado a que el ítem siga con el mismo `GSI2SK`.
 * Devuelve `false` si ya estaba limpio (otro proceso lo retiró).
 */
export async function removePeriodFromActiveIndex(
  client: DynamoDBDocumentClient,
  period: { PK: string; SK: string; endsAt: string },
): Promise<boolean> {
  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { PK: period.PK, SK: period.SK },
        ConditionExpression: 'attribute_exists(PK) AND GSI2SK = :endsAt',
        UpdateExpression: 'REMOVE GSI2PK, GSI2SK',
        ExpressionAttributeValues: { ':endsAt': period.endsAt },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionalCheckFailure(error)) return false;
    throw error;
  }
}
