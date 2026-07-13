// Entidades y DTOs de socios, activación y registro.
// Alineado con docs/data/diccionario-de-datos.md y docs/api/contratos-api.md §3-4.

import type { ISODateString } from './common';

export type MemberOrigin = 'MIGRATED' | 'NEW';

export type MemberStatus = 'MIGRATED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE';

export type MembershipType = 'MONTHLY' | 'ANNUAL';

export type MembershipStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'DEBT' | 'NONE';

/** Socio (entidad Member del modelo single-table). */
export interface Member {
  memberId: string;
  legacyId: string | null;
  dni: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  origin: MemberOrigin;
  memberStatus: MemberStatus;
  cognitoSub: string | null;
  rejectionReason: string | null;
  membershipType: MembershipType | null;
  membershipStatus: MembershipStatus;
  membershipStartedAt: ISODateString | null;
  membershipEndsAt: ISODateString | null;
  /** Saldo pendiente en céntimos (0 si no debe). */
  outstandingBalance: number;
  autoRenew: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Vista resumida de socio para listados administrativos. */
export interface MemberSummary {
  memberId: string;
  dni: string;
  firstName: string;
  lastName: string;
  origin: MemberOrigin;
  memberStatus: MemberStatus;
  membershipStatus: MembershipStatus;
  createdAt: ISODateString;
}

// --- Activación (RN-ACT) ---

export interface VerifyDniRequest {
  dni: string;
}

export interface VerifyDniResponse {
  eligible: boolean;
  memberId: string;
  firstName: string;
  maskedEmail: string;
}

export interface CompleteActivationRequest {
  dni: string;
  email: string;
  password: string;
}

export interface CompleteActivationResponse {
  memberId: string;
  memberStatus: MemberStatus;
  membershipStatus: MembershipStatus;
}

// --- Registro (RN-ACT-05) ---

export interface RegistrationRequest {
  dni: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface RegistrationResponse {
  memberId: string;
  memberStatus: MemberStatus;
}

// --- Gestión de socios (admin / self) ---

export interface UpdateMemberRequest {
  phone?: string;
}

export interface AutoRenewRequest {
  enabled: boolean;
}

export interface ApproveMemberResponse {
  memberId: string;
  memberStatus: MemberStatus;
}

export interface RejectMemberRequest {
  reason: string;
}
