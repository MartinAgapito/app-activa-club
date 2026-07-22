// Orquestador de POST /registration (RN-ACT-03/05/06/07,
// docs/api/contratos-api.md §3, docs/scrum/historias/US-016-registro-socio-nuevo.md):
// verifica que el DNI y el correo no estén ya asociados a otra cuenta, crea
// el usuario Cognito (grupo `member`, contraseña definitiva) y persiste el
// `Member` `origin=NEW`/`PENDING` de forma atómica junto con sus ítems de
// unicidad.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RegistrationRequest, RegistrationResponse } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { createMemberCognitoUser, type CreateMemberCognitoUser } from './cognito';
import { isDniRegistered, isEmailRegistered, writeNewMember } from './repository';
import { buildNewMemberItems } from './transform';

export interface RegisterMemberInput {
  request: RegistrationRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Creador de usuario Cognito inyectable, para pruebas sin AWS real. */
  createCognitoUser?: CreateMemberCognitoUser;
  /** `memberId` inyectable, para pruebas deterministas. */
  memberId?: string;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

function conflictError(outcome: 'DNI_CONFLICT' | 'EMAIL_CONFLICT'): AppError {
  return outcome === 'DNI_CONFLICT'
    ? new AppError('DNI_ALREADY_USED', 'Ya existe una cuenta asociada a este DNI.')
    : new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.');
}

/**
 * Registra un socio nuevo (RN-ACT-05): verifica que el DNI y el correo no
 * estén ya asociados a otra cuenta (RN-ACT-03), crea el usuario Cognito
 * (grupo `member`, contraseña definitiva gestionada por Cognito) y el
 * `Member` en `PENDING` (RN-ACT-06). El socio queda a la espera de
 * aprobación administrativa y, tras ella, de pagar su primera membresía
 * (RN-ACT-07; fuera de alcance de esta historia).
 */
export async function registerMember(input: RegisterMemberInput): Promise<RegistrationResponse> {
  const client = input.client ?? getDocumentClient();
  const createCognitoUser = input.createCognitoUser ?? createMemberCognitoUser;
  const dni = input.request.dni.trim();
  const emailLower = input.request.email.trim().toLowerCase();

  if (await isDniRegistered(client, dni)) {
    throw new AppError('DNI_ALREADY_USED', 'Ya existe una cuenta asociada a este DNI.');
  }
  if (await isEmailRegistered(client, emailLower)) {
    throw new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.');
  }

  const cognitoSub = await createCognitoUser({
    email: emailLower,
    password: input.request.password,
  });

  const items = buildNewMemberItems(
    {
      dni,
      email: emailLower,
      firstName: input.request.firstName,
      lastName: input.request.lastName,
      ...(input.request.phone !== undefined ? { phone: input.request.phone } : {}),
      cognitoSub,
    },
    {
      ...(input.memberId !== undefined ? { memberId: input.memberId } : {}),
      ...(input.now !== undefined ? { now: input.now.toISOString() } : {}),
    },
  );

  const outcome = await writeNewMember(client, items);
  if (outcome !== 'CREATED') {
    // No debería ocurrir tras las verificaciones previas, salvo una carrera
    // real entre solicitudes concurrentes con el mismo DNI/correo (RT). El
    // usuario Cognito ya creado queda huérfano: esta Lambda no tiene permiso
    // de limpieza (`cognito-idp:AdminDeleteUser`); se documenta como riesgo
    // pendiente en vez de asumir un permiso no otorgado por Terraform.
    logger.warn('registration uniqueness conflict after creating cognito user', {
      requestId: 'registration',
      route: 'REGISTER_MEMBER',
      action: 'REGISTER_MEMBER',
      outcome: 'FAILURE',
      conflict: outcome,
    });
    throw conflictError(outcome);
  }

  return { memberId: items.member.memberId, memberStatus: 'PENDING' };
}
