// Transformación pura de una solicitud de registro validada a los ítems
// DynamoDB documentados (docs/data/modelo-dynamodb.md §3.1/3.2/3.3, RN-ACT-05).
// Sin efectos de lado: no llama a AWS aquí, para poder probar la
// transformación de forma aislada. La persistencia transaccional vive en
// ./repository.ts; la creación del usuario Cognito en ./cognito.ts.

import { ulid } from 'ulid';
import type { Member } from '@activa-club/shared-types';

import { keys } from '../lib/dynamo';

/** Datos ya validados (registrationSchema) más el `cognitoSub` recién creado. */
export interface NewMemberDetails {
  dni: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  cognitoSub: string;
}

export interface NewMemberItem extends Member {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
  entityType: 'Member';
}

export interface UniqueConstraintItem {
  PK: string;
  SK: string;
  entityType: 'UniqueDni' | 'UniqueEmail';
  memberId: string;
}

export interface TransformedNewMember {
  member: NewMemberItem;
  uniqueDni: UniqueConstraintItem;
  uniqueEmail: UniqueConstraintItem;
}

export interface BuildNewMemberItemsDeps {
  memberId?: string;
  /** Marca de tiempo ISO usada como `createdAt`/`updatedAt` (inyectable en pruebas). */
  now?: string;
}

/**
 * Construye los 3 ítems de un socio nuevo (`Member` `origin=NEW`/`PENDING`,
 * `UniqueDni`, `UniqueEmail`) para la transacción idempotente de
 * `./repository.ts` (RN-ACT-03/05). A diferencia de un socio migrado (ver
 * `../migration/transform.ts`), el socio nuevo ya tiene `cognitoSub` desde el
 * alta (el usuario Cognito se crea antes de persistir en DynamoDB), por lo
 * que `GSI1` (resolución por `cognitoSub` tras el login) se puebla de
 * inmediato en vez de quedar pendiente de una activación posterior.
 */
export function buildNewMemberItems(
  details: NewMemberDetails,
  deps: BuildNewMemberItemsDeps = {},
): TransformedNewMember {
  const memberId = deps.memberId ?? ulid();
  const now = deps.now ?? new Date().toISOString();
  const emailLower = details.email.trim().toLowerCase();

  const member: NewMemberItem = {
    ...keys.member(memberId),
    ...keys.memberByCognitoSub(details.cognitoSub),
    GSI2PK: 'MEMBER#STATUS#PENDING',
    GSI2SK: `${now}#${memberId}`,
    entityType: 'Member',
    memberId,
    legacyId: null,
    dni: details.dni,
    email: emailLower,
    firstName: details.firstName,
    lastName: details.lastName,
    phone: details.phone ?? null,
    origin: 'NEW',
    memberStatus: 'PENDING',
    cognitoSub: details.cognitoSub,
    rejectionReason: null,
    membershipType: null,
    membershipStatus: 'NONE',
    membershipStartedAt: null,
    membershipEndsAt: null,
    outstandingBalance: 0,
    autoRenew: false,
    createdAt: now,
    updatedAt: now,
  };

  const uniqueDni: UniqueConstraintItem = {
    ...keys.uniqueDni(details.dni),
    entityType: 'UniqueDni',
    memberId,
  };

  const uniqueEmail: UniqueConstraintItem = {
    ...keys.uniqueEmail(emailLower),
    entityType: 'UniqueEmail',
    memberId,
  };

  return { member, uniqueDni, uniqueEmail };
}
