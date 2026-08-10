// Persistencia de pagos (`Payment`, `MembershipPeriod`, `Member`;
// docs/data/modelo-dynamodb.md §3.4/3.5, patrones #1/#3; US-021 criterios
// 3/4/5/9).
//
// Estrategia de dos fases (ver también ADR-0011, caso alternativo "falla de
// escritura en DynamoDB después de un cargo aprobado"):
// 1. `createPendingPayment` escribe el `Payment` como `PENDING_CONFIRMATION`
//    **antes** de intentar el cargo en Stripe. Así, si el proceso se
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
import type {
  Currency,
  MembershipType,
  Paginated,
  Payment,
  PaymentStatus,
  PaymentSummary,
} from '@activa-club/shared-types';

import { decodeCursor, encodeCursor } from '../lib/cursor';
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
        stripePaymentIntentId: null,
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
  stripePaymentIntentId: string;
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
              'SET paymentStatus = :succeeded, stripePaymentIntentId = :intentId, confirmedAt = :confirmedAt, GSI2PK = :paymentGsi2pk',
            ExpressionAttributeValues: {
              ':pending': 'PENDING_CONFIRMATION',
              ':succeeded': 'SUCCEEDED',
              ':intentId': input.stripePaymentIntentId,
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

// --- Lectura: historial de pagos (US-025, docs/api/contratos-api.md §5) ---
//
// Reutiliza exactamente los dos patrones de acceso ya documentados para
// `Payment` (docs/data/modelo-dynamodb.md §3.5/§4, patrones #3 y #16): nunca
// se agrega un índice nuevo para el listado. `toPaymentSummary` recorta el
// ítem crudo a la vista pública del contrato (criterio 7, RN-PAG-08): nunca
// expone `idempotencyKey` ni `failureReason` (campos internos de
// orquestación, fuera del contrato documentado).

/** Tamaño de página por defecto para el historial de pagos (US-025). */
const DEFAULT_PAGE_SIZE = 20;

/**
 * Salvaguarda defensiva para las búsquedas por `paymentId` (`getPaymentByMemberAndId`,
 * `findPaymentById`): como el modelo no tiene un patrón de acceso directo por
 * `paymentId` (ver nota de `findPaymentById`), esas búsquedas recorren
 * páginas de una `Query` con `FilterExpression` hasta encontrar el ítem o
 * agotar la partición. Este límite evita un bucle indefinido si algo
 * inesperado ocurriera (p. ej. `paymentId` corrupto); en la escala real de un
 * club privado, nunca debería alcanzarse.
 */
const MAX_LOOKUP_PAGES = 50;

export function toPaymentSummary(item: Payment | Record<string, unknown>): PaymentSummary {
  // TODO(Sprint 2): mismo riesgo señalado en `members/repository.ts`
  // (`toMemberSummary`) — validar la forma del ítem leído contra un esquema
  // propio de acceso a datos antes de confiar en el cast.
  const payment = item as unknown as Payment;
  return {
    paymentId: payment.paymentId,
    memberId: payment.memberId,
    membershipType: payment.membershipType,
    amount: payment.amount,
    currency: payment.currency,
    paymentStatus: payment.paymentStatus,
    stripePaymentIntentId: payment.stripePaymentIntentId,
    createdAt: payment.createdAt,
    confirmedAt: payment.confirmedAt,
  };
}

export interface ListPaymentsByMemberOptions {
  /** Filtro adicional por estado (criterio 3/4); se aplica dentro de la misma partición del socio. */
  status?: PaymentStatus;
  cursor?: string;
  limit?: number;
}

/**
 * Historial de pagos de un socio (patrón de acceso #3), más reciente primero
 * (criterio 1): `Query` PK=`MEMBER#<id>`, `begins_with(SK,"PAYMENT#")`,
 * `ScanIndexForward: false` (el `SK` ordena cronológicamente por `createdAt`).
 * Usado tanto para `member` (siempre su propio `memberId`, resuelto por el
 * llamante desde la identidad autenticada — nunca desde la query del
 * cliente, criterio 4) como para `admin` filtrando por `memberId`.
 */
export async function listPaymentsByMember(
  client: DynamoDBDocumentClient,
  memberId: string,
  options: ListPaymentsByMemberOptions = {},
): Promise<Paginated<PaymentSummary>> {
  const memberKey = keys.member(memberId);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ...(options.status ? { FilterExpression: 'paymentStatus = :status' } : {}),
      ExpressionAttributeValues: {
        ':pk': memberKey.PK,
        ':prefix': 'PAYMENT#',
        ...(options.status ? { ':status': options.status } : {}),
      },
      ScanIndexForward: false,
      Limit: options.limit ?? DEFAULT_PAGE_SIZE,
      ExclusiveStartKey: decodeCursor(options.cursor),
    }),
  );

  return {
    items: (result.Items ?? []).map(toPaymentSummary),
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}

export interface ListPaymentsByStatusOptions {
  cursor?: string;
  limit?: number;
}

/**
 * Pagos por estado (patrón de acceso #16, GSI2), más reciente primero: `Query`
 * GSI2PK=`PAYMENT#STATUS#<status>`, `ScanIndexForward: false` (`GSI2SK` es
 * `<createdAt>#<paymentId>`). Usado por `admin` cuando filtra por `status`
 * sin `memberId` (criterio 3).
 */
export async function listPaymentsByStatus(
  client: DynamoDBDocumentClient,
  status: PaymentStatus,
  options: ListPaymentsByStatusOptions = {},
): Promise<Paginated<PaymentSummary>> {
  const gsi2Key = keys.paymentsByStatus(status);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi2Key.GSI2PK },
      ScanIndexForward: false,
      Limit: options.limit ?? DEFAULT_PAGE_SIZE,
      ExclusiveStartKey: decodeCursor(options.cursor),
    }),
  );

  return {
    items: (result.Items ?? []).map(toPaymentSummary),
    nextCursor: encodeCursor(result.LastEvaluatedKey),
  };
}

/**
 * Detalle de un pago propio (`GET /payments/{paymentId}`, `member`): recorre
 * la partición del socio (patrón #3) filtrando por `paymentId` hasta
 * encontrarlo. Acotado por diseño: es la partición de un único socio (su
 * propio historial de pagos), no la tabla completa — nunca un `Scan`.
 */
export async function getPaymentByMemberAndId(
  client: DynamoDBDocumentClient,
  memberId: string,
  paymentId: string,
): Promise<Payment | undefined> {
  const memberKey = keys.member(memberId);
  let exclusiveStartKey: Record<string, unknown> | undefined;

  for (let page = 0; page < MAX_LOOKUP_PAGES; page += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: 'paymentId = :id',
        ExpressionAttributeValues: { ':pk': memberKey.PK, ':prefix': 'PAYMENT#', ':id': paymentId },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const match = result.Items?.find((item) => item['paymentId'] === paymentId);
    if (match) return match as unknown as Payment;
    if (!result.LastEvaluatedKey) return undefined;
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return undefined;
}

const PAYMENT_STATUSES: readonly PaymentStatus[] = ['PENDING_CONFIRMATION', 'SUCCEEDED', 'FAILED'];

/**
 * Resuelve un `Payment` por `paymentId` sin conocer su `memberId`
 * (`GET /payments/{paymentId}`, `admin`, criterio 5/6).
 *
 * El modelo de datos (docs/data/modelo-dynamodb.md §3.5/§4) no define un
 * patrón de acceso directo "por `paymentId`" — solo por socio (patrón #3,
 * requiere `memberId`) o por estado (patrón #16, GSI2). Como el rol `admin`
 * puede pedir el detalle de cualquier pago sin conocer su `memberId`, esta
 * función recorre cada partición de estado del GSI2 (a lo sumo 3: hoy
 * `PENDING_CONFIRMATION`/`SUCCEEDED`/`FAILED`) filtrando por `paymentId`.
 * Sigue evitando un `Scan` completo de la tabla (cada `Query` está acotada a
 * una partición de GSI2, un índice ya existente), pero no es O(1): si el
 * volumen de pagos por estado creciera lo suficiente para que el costo
 * importe, la solución de fondo es un GSI dedicado (`PAYMENT#<paymentId>`
 * como PK directa), que requiere una migración de `infrastructure/terraform`
 * fuera del alcance de este agente — documentado como pendiente en el
 * reporte de US-025.
 */
export async function findPaymentById(
  client: DynamoDBDocumentClient,
  paymentId: string,
): Promise<Payment | undefined> {
  for (const status of PAYMENT_STATUSES) {
    const found = await findPaymentByIdInStatus(client, status, paymentId);
    if (found) return found;
  }
  return undefined;
}

async function findPaymentByIdInStatus(
  client: DynamoDBDocumentClient,
  status: PaymentStatus,
  paymentId: string,
): Promise<Payment | undefined> {
  const gsi2Key = keys.paymentsByStatus(status);
  let exclusiveStartKey: Record<string, unknown> | undefined;

  for (let page = 0; page < MAX_LOOKUP_PAGES; page += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        FilterExpression: 'paymentId = :id',
        ExpressionAttributeValues: { ':pk': gsi2Key.GSI2PK, ':id': paymentId },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const match = result.Items?.find((item) => item['paymentId'] === paymentId);
    if (match) return match as unknown as Payment;
    if (!result.LastEvaluatedKey) return undefined;
    exclusiveStartKey = result.LastEvaluatedKey;
  }

  return undefined;
}
