// Orquestador de `POST /payments` (US-021, docs/api/contratos-api.md §5,
// ADR-0007): resuelve el socio autenticado, valida su precondición de estado
// (`./eligibility.ts`), resuelve el plan a cobrar desde el backend
// (`./plans.ts`, nunca desde el cliente), reserva la `idempotencyKey`
// (`./idempotency.ts`) antes de cualquier cargo, delega el cargo real a un
// cliente de Culqi inyectable (`./culqi-client.ts`) y persiste el resultado
// (`./repository.ts`) según lo que confirme ese cargo — la membresía nunca se
// activa sin una confirmación segura (RN-PAG-07).

import { ulid } from 'ulid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreatePaymentRequest, CreatePaymentResponse } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { findMemberByCognitoSub } from '../members/repository';
import {
  notImplementedCulqiClient,
  type CulqiChargeClient,
  type CulqiChargeOutcome,
} from './culqi-client';
import { assertMemberCanPay } from './eligibility';
import { finalizeIdempotencyRecord, reserveIdempotencyKey } from './idempotency';
import { resolveMembershipCycle } from './membership-cycle';
import { resolveMembershipPlan } from './plans';
import { confirmPaymentSuccess, createPendingPayment, markPaymentFailed } from './repository';

export interface CreatePaymentInput {
  /** `cognitoSub` de la identidad autenticada (el socio siempre es el titular del pago). */
  cognitoSub: string;
  request: CreatePaymentRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /**
   * Cliente de cargos de Culqi inyectable (mockeable en tests). Por defecto,
   * el stub sin integración real (`./culqi-client.ts`); se reemplaza cuando
   * exista la llamada HTTP real a Culqi sandbox.
   */
  chargeClient?: CulqiChargeClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
  /** `paymentId` inyectable, para pruebas deterministas. */
  paymentId?: string;
  /** `membershipId` del nuevo `MembershipPeriod`, inyectable, para pruebas deterministas. */
  membershipId?: string;
}

/**
 * Construye el error de clave duplicada (criterio 2) reutilizando el `field`/
 * `issue` de `ErrorDetail` para exponer el `paymentId`/`paymentStatus`
 * previos: es una reutilización pragmática del tipo de error existente (no se
 * definió un contrato específico para el cuerpo de `PAYMENT_DUPLICATE`); el
 * socio puede resolver el detalle completo con `GET /payments/{paymentId}`
 * (US-025). A confirmar con Arquitecto/Frontend al construir el checkout
 * (US-022).
 */
function buildDuplicateError(previous: { paymentId: string; paymentStatus: string }): AppError {
  return new AppError(
    'PAYMENT_DUPLICATE',
    'Ya existe un pago procesado con esta clave de idempotencia.',
    [
      { field: 'paymentId', issue: previous.paymentId },
      { field: 'paymentStatus', issue: previous.paymentStatus },
    ],
  );
}

/**
 * Invoca el cliente de cargos y normaliza cualquier excepción (red, timeout,
 * o el stub sin implementar) a `AMBIGUOUS`: "si Culqi responde de forma
 * ambigua o se pierde la respuesta, el pago queda `PENDING_CONFIRMATION`"
 * (criterio 5). Preferible a dejar caer la solicitud con `INTERNAL_ERROR`: un
 * pago que sí llegó a intentarse nunca debe perderse sin dejar rastro.
 */
async function attemptCharge(
  chargeClient: CulqiChargeClient,
  input: Parameters<CulqiChargeClient>[0],
): Promise<CulqiChargeOutcome> {
  try {
    return await chargeClient(input);
  } catch (error) {
    logger.warn('culqi charge attempt failed or is not confirmed', {
      requestId: 'payments',
      route: 'CREATE_PAYMENT',
      action: 'CULQI_CHARGE',
      outcome: 'FAILURE',
      // Nunca el mensaje de error crudo del proveedor si pudiera contener
      // datos sensibles; solo el nombre del error (ADR-0008, RN-PAG-08).
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return { outcome: 'AMBIGUOUS' };
  }
}

/**
 * Procesa `POST /payments` de punta a punta (criterios 1-13). Ver cabecera
 * del módulo para el resumen del flujo.
 */
export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResponse> {
  const client = input.client ?? getDocumentClient();
  const chargeClient = input.chargeClient ?? notImplementedCulqiClient;
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const paymentId = input.paymentId ?? ulid();

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  assertMemberCanPay(member.memberStatus);

  const plan = resolveMembershipPlan(input.request.membershipType);
  const autoRenewRequested = input.request.autoRenew === true;

  const reservation = await reserveIdempotencyKey(client, {
    idempotencyKey: input.request.idempotencyKey,
    paymentId,
    now: nowIso,
  });
  if (reservation.outcome === 'DUPLICATE') {
    throw buildDuplicateError(reservation);
  }

  await createPendingPayment(client, {
    memberId: member.memberId,
    paymentId,
    createdAt: nowIso,
    membershipType: plan.type,
    amount: plan.amount,
    currency: plan.currency,
    idempotencyKey: input.request.idempotencyKey,
    autoRenewRequested,
  });

  const chargeOutcome = await attemptCharge(chargeClient, {
    culqiToken: input.request.culqiToken,
    amount: plan.amount,
    currency: plan.currency,
    reference: paymentId,
  });

  if (chargeOutcome.outcome === 'DECLINED') {
    await markPaymentFailed(client, {
      memberId: member.memberId,
      paymentId,
      createdAt: nowIso,
      failureReason: chargeOutcome.reason,
    });
    await finalizeIdempotencyRecord(client, input.request.idempotencyKey, 'FAILED');
    throw new AppError('PAYMENT_FAILED', chargeOutcome.reason);
  }

  if (chargeOutcome.outcome === 'AMBIGUOUS') {
    // El `Payment` ya quedó `PENDING_CONFIRMATION` en `createPendingPayment`;
    // no se activa la membresía (criterio 5). La reconciliación llega por
    // reconsulta o webhook (US-024, fuera de alcance).
    return {
      paymentId,
      paymentStatus: 'PENDING_CONFIRMATION',
      membershipType: plan.type,
      amount: plan.amount,
      currency: plan.currency,
      membershipEndsAt: null,
    };
  }

  const cycle = resolveMembershipCycle({
    membershipType: plan.type,
    paymentConfirmedAt: nowIso,
    currentMembershipStatus: member.membershipStatus,
    currentMembershipEndsAt: member.membershipEndsAt,
  });
  const membershipId = input.membershipId ?? ulid();

  await confirmPaymentSuccess(client, {
    memberId: member.memberId,
    paymentId,
    createdAt: nowIso,
    culqiChargeId: chargeOutcome.culqiChargeId,
    confirmedAt: nowIso,
    membershipId,
    membershipType: plan.type,
    cycleStartedAt: cycle.startedAt,
    cycleEndsAt: cycle.endsAt,
    autoRenewRequested,
  });
  await finalizeIdempotencyRecord(client, input.request.idempotencyKey, 'SUCCEEDED');

  return {
    paymentId,
    paymentStatus: 'SUCCEEDED',
    membershipType: plan.type,
    amount: plan.amount,
    currency: plan.currency,
    membershipEndsAt: cycle.endsAt,
  };
}
