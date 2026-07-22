// Orquestador de aprobación/rechazo de socios nuevos (US-017,
// docs/api/contratos-api.md §4, RN-ACT-06/07, RN-ADM-02): resuelve el socio
// por `memberId`, transiciona `PENDING -> APPROVED|REJECTED` con la condición
// atómica de `transitionMemberStatus` (evita la doble transición si dos
// admins actúan sobre la misma solicitud) y deja constancia en `AuditLog`.
//
// No implementa el pago de la primera membresía (RN-ACT-07) ni el envío de
// notificaciones (`MEMBER_APPROVED`/`MEMBER_REJECTED`): quedan fuera de
// alcance de esta historia, igual que se dejó pendiente en US-013/US-016 para
// SES/pagos.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ApproveMemberResponse } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { getMemberById, transitionMemberStatus } from './repository';

export interface DecideMemberInput {
  memberId: string;
  actor: AuditActor;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (`lib/dynamo`). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

export interface RejectMemberInput extends DecideMemberInput {
  reason: string;
}

async function requireExistingMember(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<void> {
  const existing = await getMemberById(client, memberId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'No se encontró el socio indicado.');
  }
}

/**
 * Aprueba un socio nuevo (US-017, criterio 3): `PENDING -> APPROVED` +
 * auditoría `MEMBER_APPROVED`. El socio queda habilitado para pagar su
 * primera membresía (RN-ACT-07), no para reservar todavía.
 */
export async function approveMember(input: DecideMemberInput): Promise<ApproveMemberResponse> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  await requireExistingMember(client, input.memberId);

  const outcome = await transitionMemberStatus(client, input.memberId, { to: 'APPROVED' }, now);
  if (outcome === 'NOT_PENDING') {
    throw new AppError('CONFLICT', 'El socio no está pendiente de aprobación.');
  }

  await recordAuditLog(client, {
    action: 'MEMBER_APPROVED',
    actor: input.actor,
    targetType: 'Member',
    targetId: input.memberId,
    metadata: null,
    now,
  });

  return { memberId: outcome.memberId, memberStatus: outcome.memberStatus };
}

/**
 * Rechaza un socio nuevo con un motivo obligatorio (US-017, criterio 4):
 * `PENDING -> REJECTED` + auditoría `MEMBER_REJECTED` con el motivo.
 */
export async function rejectMember(input: RejectMemberInput): Promise<ApproveMemberResponse> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  await requireExistingMember(client, input.memberId);

  const outcome = await transitionMemberStatus(
    client,
    input.memberId,
    { to: 'REJECTED', rejectionReason: input.reason },
    now,
  );
  if (outcome === 'NOT_PENDING') {
    throw new AppError('CONFLICT', 'El socio no está pendiente de aprobación.');
  }

  await recordAuditLog(client, {
    action: 'MEMBER_REJECTED',
    actor: input.actor,
    targetType: 'Member',
    targetId: input.memberId,
    metadata: { reason: input.reason },
    now,
  });

  return { memberId: outcome.memberId, memberStatus: outcome.memberStatus };
}
