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
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Currency, MembershipType } from '@activa-club/shared-types';

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
