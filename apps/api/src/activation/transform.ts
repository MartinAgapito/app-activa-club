// Transformación pura de la activación de un socio migrado (RN-ACT-01/02/03,
// docs/data/modelo-dynamodb.md §3.1). Sin efectos de lado: no llama a AWS
// aquí, para poder probar la transformación de forma aislada. La persistencia
// (transacción condicionada) vive en ./repository.ts; la creación del usuario
// Cognito en ./cognito.ts.

import type { Member, MembershipStatus } from '@activa-club/shared-types';

import { keys } from '../lib/dynamo';
import { deriveMembershipStatus } from '../migration/transform';

/** Subconjunto del `Member` necesario para decidir elegibilidad de activación. */
export type MigratedMemberCandidate = Pick<Member, 'memberStatus' | 'cognitoSub'>;

/**
 * Un socio es elegible para `POST /activation/complete` solo si sigue en
 * `MIGRATED` y sin `cognitoSub` enlazado (precondición de US-013). Se
 * reevalúa aquí en vez de confiar en `verifyActivation`, por si pasó tiempo
 * entre `verify` y `complete` (p. ej. otra solicitud ya lo activó).
 */
export function isEligibleMigratedMember(member: MigratedMemberCandidate): boolean {
  return member.memberStatus === 'MIGRATED' && member.cognitoSub === null;
}

/**
 * Enmascara el correo para mostrarlo en `POST /activation/verify` sin
 * revelarlo completo (docs/api/contratos-api.md §3): conserva el primer
 * carácter del usuario y el dominio completo, p. ej.
 * `maria.quispe@example.com` -> `m***@example.com`.
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (domain === undefined) return email;
  const firstChar = localPart?.[0] ?? '';
  return `${firstChar}***@${domain}`;
}

export interface BuildActivationUpdateInput {
  cognitoSub: string;
  /** Vigencia de la membresía migrada (Member.membershipEndsAt). */
  membershipEndsAt: string | null;
  /** Saldo pendiente migrado (Member.outstandingBalance). */
  outstandingBalance: number;
  /** `membershipStatus` actual del socio, usado como respaldo si no hay `membershipEndsAt` (no debería ocurrir para un migrado). */
  currentMembershipStatus: MembershipStatus;
  /** Fecha de hoy en zona America/Lima, formato `YYYY-MM-DD` (ver `../migration/transform.ts`). */
  todayLima: string;
  /** Marca de tiempo ISO usada como `updatedAt` (inyectable en pruebas). */
  now?: string;
}

export interface ActivationUpdateValues {
  memberStatus: 'ACTIVE';
  membershipStatus: MembershipStatus;
  cognitoSub: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  updatedAt: string;
}

/**
 * Calcula los atributos a escribir sobre el `Member` ya existente al activar
 * su cuenta (RN-ACT-01/04): `memberStatus` pasa siempre a `ACTIVE` (el enum
 * no distingue "activo con deuda"); `membershipStatus` se recalcula con el
 * mismo criterio de vigencia usado en la migración (`deriveMembershipStatus`,
 * `../migration/transform.ts`), por si venció o entró en deuda desde que se
 * migró (docs/scrum/historias/US-013 - caso alternativo "membresía migrada
 * vencida o con deuda").
 */
export function buildActivationUpdate(input: BuildActivationUpdateInput): ActivationUpdateValues {
  const updatedAt = input.now ?? new Date().toISOString();
  const membershipStatus = input.membershipEndsAt
    ? deriveMembershipStatus(input.membershipEndsAt, input.outstandingBalance, input.todayLima)
    : input.currentMembershipStatus;

  return {
    memberStatus: 'ACTIVE',
    membershipStatus,
    cognitoSub: input.cognitoSub,
    ...keys.memberByCognitoSub(input.cognitoSub),
    GSI2PK: 'MEMBER#STATUS#ACTIVE',
    updatedAt,
  };
}
