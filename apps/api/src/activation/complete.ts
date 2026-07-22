// Orquestador de POST /activation/complete (RN-ACT-01/02/03/04,
// docs/api/contratos-api.md §3, docs/scrum/historias/US-013-activacion-cuenta-socio-dni.md):
// revalida elegibilidad (no confía solo en `./verify.ts`, por si pasó tiempo
// entre ambas llamadas), verifica que el correo no esté en uso, crea el
// usuario Cognito (grupo `member`, contraseña definitiva) y enlaza
// `cognitoSub` al `Member` migrado ya existente.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CompleteActivationRequest,
  CompleteActivationResponse,
} from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { limaDateOnly } from '../migration/transform';
import { createActivationCognitoUser, type CreateActivationCognitoUser } from './cognito';
import {
  completeActivationWrite,
  findMemberIdByDni,
  getMemberById,
  isEmailRegistered,
  type CompleteActivationOutcome,
} from './repository';
import { buildActivationUpdate, isEligibleMigratedMember } from './transform';

export interface CompleteActivationInput {
  request: CompleteActivationRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Creador de usuario Cognito inyectable, para pruebas sin AWS real. */
  createCognitoUser?: CreateActivationCognitoUser;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

function conflictError(outcome: Exclude<CompleteActivationOutcome, 'ACTIVATED'>): AppError {
  return outcome === 'EMAIL_CONFLICT'
    ? new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.')
    : new AppError('ALREADY_ACTIVATED', 'Este socio ya activó su cuenta digital.');
}

/**
 * Completa la activación de un socio migrado (RN-ACT-01/02/03/04): crea el
 * usuario Cognito (grupo `member`, contraseña definitiva gestionada por
 * Cognito) y enlaza `cognitoSub` al `Member` ya existente con un
 * `UpdateItem` (nunca un `PutItem` nuevo: preserva `legacyId`, membresía y
 * saldo de la migración, US-012). `memberStatus` pasa a `ACTIVE`;
 * `membershipStatus` se recalcula con el mismo criterio de vigencia de la
 * migración (`deriveMembershipStatus`, `../migration/transform.ts`), por si
 * la membresía venció o entró en deuda desde que se migró.
 */
export async function completeActivation(
  input: CompleteActivationInput,
): Promise<CompleteActivationResponse> {
  const client = input.client ?? getDocumentClient();
  const createCognitoUser = input.createCognitoUser ?? createActivationCognitoUser;
  const now = input.now ?? new Date();
  const dni = input.request.dni.trim();
  const emailLower = input.request.email.trim().toLowerCase();

  const memberId = await findMemberIdByDni(client, dni);
  if (!memberId) {
    throw new AppError('DNI_NOT_FOUND', 'No se encontró un socio migrado con este DNI.');
  }

  const member = await getMemberById(client, memberId);
  if (!member) {
    // No debería ocurrir: el ítem UniqueDni siempre se escribe junto al
    // Member en la misma transacción de migración (RT). Defensivo.
    logger.error('unique dni item without matching member', {
      requestId: 'activation-complete',
      route: 'COMPLETE_ACTIVATION',
      action: 'COMPLETE_ACTIVATION',
      outcome: 'FAILURE',
      memberId,
    });
    throw new AppError('INTERNAL_ERROR', 'Ocurrió un error interno inesperado.');
  }

  if (!isEligibleMigratedMember(member)) {
    throw new AppError('ALREADY_ACTIVATED', 'Este socio ya activó su cuenta digital.');
  }

  if (await isEmailRegistered(client, emailLower)) {
    throw new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.');
  }

  const cognitoSub = await createCognitoUser({
    email: emailLower,
    password: input.request.password,
  });

  const values = buildActivationUpdate({
    cognitoSub,
    membershipEndsAt: member.membershipEndsAt,
    outstandingBalance: member.outstandingBalance,
    currentMembershipStatus: member.membershipStatus,
    todayLima: limaDateOnly(now),
    now: now.toISOString(),
  });

  const outcome = await completeActivationWrite(client, {
    memberId: member.memberId,
    emailLower,
    values,
  });

  if (outcome !== 'ACTIVATED') {
    // No debería ocurrir tras las verificaciones previas, salvo una carrera
    // real entre solicitudes concurrentes con el mismo DNI/correo (RT). El
    // usuario Cognito ya creado queda huérfano: esta Lambda no tiene permiso
    // de limpieza (`cognito-idp:AdminDeleteUser`); se documenta como riesgo
    // pendiente en vez de asumir un permiso no otorgado por Terraform (mismo
    // riesgo ya documentado en ../registration/register.ts).
    logger.warn('activation uniqueness conflict after creating cognito user', {
      requestId: 'activation-complete',
      route: 'COMPLETE_ACTIVATION',
      action: 'COMPLETE_ACTIVATION',
      outcome: 'FAILURE',
      conflict: outcome,
    });
    throw conflictError(outcome);
  }

  return {
    memberId: member.memberId,
    memberStatus: values.memberStatus,
    membershipStatus: values.membershipStatus,
  };
}
