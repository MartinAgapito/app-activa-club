// Persistencia de pagos (`Payment`, `MembershipPeriod`, `Member`;
// docs/data/modelo-dynamodb.md §3.4/3.5, patrones #1/#3; US-021 criterios
// 3/4/5/9).
//
// Estrategia de dos fases (ver también ADR-0007, caso alternativo "falla de
// escritura en DynamoDB después de un cargo aprobado"):
// 1. `createPendingPayment` escribe el `Payment` como `PENDING_CONFIRMATION`
//    **antes** de intentar el cargo en Culqi. Así, si el proceso se
//    interrumpe justo después de un cargo aprobado, el `Payment` ya existe de
//    forma durable en `PENDING_CONFIRMATION` (nunca se pierde ni se cobra de
//    nuevo) y queda pendiente de reconciliación (webhook, US-024).
// 2. Según el resultado del cargo, `markPaymentFailed` (fallo) o
//    `confirmPaymentSuccess` (éxito, transacción atómica con `MembershipPeriod`
//    y `Member`) actualizan ese mismo ítem.
//
// Solo se persisten los campos del criterio 9 (RN-PAG-08): nunca PAN/CVV ni
// datos de tarjeta.

import {
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Currency, MembershipType, PaymentStatus } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

export interface CreatePendingPaymentInput {
  memberId: string;
  paymentId: string;
  createdAt: string;
  membershipType: MembershipType;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  autoRenewRequested: boolean;
}

/** Escribe el `Payment` inicial en `PENDING_CONFIRMATION`, antes de intentar el cargo (ver nota de cabecera). */
export async function createPendingPayment(
  client: DynamoDBDocumentClient,
  input: CreatePendingPaymentInput,
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...keys.payment(input.memberId, input.createdAt, input.paymentId),
        ...keys.paymentsByStatus('PENDING_CONFIRMATION'),
        GSI2SK: `${input.createdAt}#${input.paymentId}`,
        entityType: 'Payment',
        paymentId: input.paymentId,
        memberId: input.memberId,
        membershipType: input.membershipType,
        amount: input.amount,
        currency: input.currency,
        paymentStatus: 'PENDING_CONFIRMATION',
        culqiChargeId: null,
        idempotencyKey: input.idempotencyKey,
        autoRenewRequested: input.autoRenewRequested,
        failureReason: null,
        createdAt: input.createdAt,
        confirmedAt: null,
      },
      // Defensivo: `paymentId` es un ULID nuevo por solicitud, así que no
      // debería colisionar; igual se condiciona por consistencia con el resto
      // del código (`../registration/repository.ts`, etc.).
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

export interface MarkPaymentFailedInput {
  memberId: string;
  paymentId: string;
  createdAt: string;
  failureReason: string;
}

/** Marca el `Payment` como `FAILED` (criterio 4). No toca `Member` ni `MembershipPeriod`: RN-PAG-07. */
export async function markPaymentFailed(
  client: DynamoDBDocumentClient,
  input: MarkPaymentFailedInput,
): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: tableName(),
      Key: keys.payment(input.memberId, input.createdAt, input.paymentId),
      ConditionExpression: 'attribute_exists(PK) AND paymentStatus = :pending',
      UpdateExpression: 'SET paymentStatus = :failed, failureReason = :reason, GSI2PK = :gsi2pk',
      ExpressionAttributeValues: {
        ':pending': 'PENDING_CONFIRMATION',
        ':failed': 'FAILED',
        ':reason': input.failureReason,
        ':gsi2pk': keys.paymentsByStatus('FAILED').GSI2PK,
      },
    }),
  );
}

export interface ConfirmPaymentSuccessInput {
  memberId: string;
  paymentId: string;
  /** `createdAt` del `Payment` (parte de su SK; el mismo usado en `createPendingPayment`). */
  createdAt: string;
  culqiChargeId: string;
  confirmedAt: string;
  membershipId: string;
  membershipType: MembershipType;
  cycleStartedAt: string;
  cycleEndsAt: string;
  /** Solo se fija `autoRenew=true` en el socio si se solicitó explícitamente (criterio 11); si no, no se toca el valor existente. */
  autoRenewRequested: boolean;
}

/**
 * Confirma un pago exitoso en una única transacción atómica (criterio 3):
 * `Payment` -> `SUCCEEDED`, nuevo `MembershipPeriod`, y `Member` con
 * `memberStatus=ACTIVE`, `membershipStatus=ACTIVE`, vigencia recalculada y
 * `outstandingBalance=0` (regulariza deuda, RN-PAG-06).
 */
export async function confirmPaymentSuccess(
  client: DynamoDBDocumentClient,
  input: ConfirmPaymentSuccessInput,
): Promise<void> {
  const table = tableName();

  const memberUpdateExpressionParts = [
    'memberStatus = :activeMemberStatus',
    'membershipStatus = :activeMembershipStatus',
    'membershipType = :membershipType',
    'membershipStartedAt = :startedAt',
    'membershipEndsAt = :endsAt',
    'outstandingBalance = :zero',
    'GSI2PK = :memberGsi2pk',
    'updatedAt = :now',
  ];
  const memberExpressionAttributeValues: Record<string, unknown> = {
    ':activeMemberStatus': 'ACTIVE',
    ':activeMembershipStatus': 'ACTIVE',
    ':membershipType': input.membershipType,
    ':startedAt': input.cycleStartedAt,
    ':endsAt': input.cycleEndsAt,
    ':zero': 0,
    ':memberGsi2pk': keys.membersByStatus('ACTIVE').GSI2PK,
    ':now': input.confirmedAt,
  };
  if (input.autoRenewRequested) {
    memberUpdateExpressionParts.push('autoRenew = :autoRenew');
    memberExpressionAttributeValues[':autoRenew'] = true;
  }

  await client.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: table,
            Key: keys.payment(input.memberId, input.createdAt, input.paymentId),
            ConditionExpression: 'attribute_exists(PK) AND paymentStatus = :pending',
            UpdateExpression:
              'SET paymentStatus = :succeeded, culqiChargeId = :chargeId, confirmedAt = :confirmedAt, GSI2PK = :paymentGsi2pk',
            ExpressionAttributeValues: {
              ':pending': 'PENDING_CONFIRMATION',
              ':succeeded': 'SUCCEEDED',
              ':chargeId': input.culqiChargeId,
              ':confirmedAt': input.confirmedAt,
              ':paymentGsi2pk': keys.paymentsByStatus('SUCCEEDED').GSI2PK,
            },
          },
        },
        {
          Put: {
            TableName: table,
            Item: {
              ...keys.membershipPeriod(input.memberId, input.cycleStartedAt, input.membershipId),
              ...keys.membershipsActive(input.cycleEndsAt),
              entityType: 'MembershipPeriod',
              membershipId: input.membershipId,
              type: input.membershipType,
              startedAt: input.cycleStartedAt,
              endsAt: input.cycleEndsAt,
              status: 'ACTIVE',
              paymentId: input.paymentId,
              createdAt: input.confirmedAt,
            },
          },
        },
        {
          Update: {
            TableName: table,
            Key: keys.member(input.memberId),
            ConditionExpression: 'attribute_exists(PK)',
            UpdateExpression: `SET ${memberUpdateExpressionParts.join(', ')}`,
            ExpressionAttributeValues: memberExpressionAttributeValues,
          },
        },
      ],
    }),
  );
}

// --- Localización por `paymentId` (US-024, webhook de Culqi) --------------
//
// El modelo documentado (docs/data/modelo-dynamodb.md §3.5) solo permite
// leer un `Payment` por `memberId` (PK) o listarlos por `paymentStatus`
// (GSI2): no existe un índice directo por `paymentId`. El webhook de Culqi
// (`POST /payments/webhook`) solo conoce el `paymentId` que este backend le
// envió como referencia al crear el cargo (ADR-0007, `./culqi-client.ts`,
// campo `reference`), no el `memberId` ni el `createdAt` que arma la clave
// real del ítem. `findPaymentByPaymentId` resuelve esto recorriendo, como
// mucho, las tres particiones de estado de GSI2 (nunca un `Scan` de toda la
// tabla): para el volumen de pagos de un único club (alcance de este
// MVP/tesis) es aceptable; si el volumen creciera de forma significativa,
// se recomienda a Arquitectura evaluar un índice dedicado por `paymentId`
// (p. ej. un futuro GSI4) en vez de mantener este recorrido acotado.

export interface PaymentRecord {
  memberId: string;
  paymentId: string;
  createdAt: string;
  paymentStatus: PaymentStatus;
  membershipType: MembershipType;
  amount: number;
  currency: Currency;
  culqiChargeId: string | null;
  idempotencyKey: string;
  autoRenewRequested: boolean;
  failureReason: string | null;
  confirmedAt: string | null;
}

/** Orden de búsqueda: primero el caso más común (pago aún no confirmado esperando el webhook). */
const PAYMENT_STATUS_LOOKUP_ORDER: readonly PaymentStatus[] = [
  'PENDING_CONFIRMATION',
  'SUCCEEDED',
  'FAILED',
];

/** Cota defensiva de páginas por partición de estado, para no arriesgar un recorrido sin fin ante un volumen de datos inesperado (protección de tiempo de ejecución de la Lambda). */
const MAX_LOOKUP_PAGES_PER_STATUS = 25;

async function findPaymentInStatusPartition(
  client: DynamoDBDocumentClient,
  paymentStatus: PaymentStatus,
  paymentId: string,
): Promise<PaymentRecord | undefined> {
  let exclusiveStartKey: Record<string, unknown> | undefined;

  for (let page = 0; page < MAX_LOOKUP_PAGES_PER_STATUS; page += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        FilterExpression: 'paymentId = :paymentId',
        ExpressionAttributeValues: {
          ':pk': keys.paymentsByStatus(paymentStatus).GSI2PK,
          ':paymentId': paymentId,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const match = (result.Items ?? []).find((item) => item['paymentId'] === paymentId);
    if (match) return match as unknown as PaymentRecord;

    if (!result.LastEvaluatedKey) return undefined;
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return undefined;
}

/**
 * Localiza un `Payment` por `paymentId` sin conocer su `memberId`/`createdAt`
 * (ver nota de cabecera de esta sección). Devuelve `undefined` si no existe
 * ningún `Payment` con ese `paymentId` en ninguno de los tres estados
 * posibles (criterios 6/7: pago inexistente/no reconocible).
 */
export async function findPaymentByPaymentId(
  client: DynamoDBDocumentClient,
  paymentId: string,
): Promise<PaymentRecord | undefined> {
  for (const paymentStatus of PAYMENT_STATUS_LOOKUP_ORDER) {
    const found = await findPaymentInStatusPartition(client, paymentStatus, paymentId);
    if (found) return found;
  }
  return undefined;
}
