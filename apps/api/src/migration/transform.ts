// Transformación pura de un socio del JSON on-premise a los ítems DynamoDB
// documentados (docs/data/mapeo-migracion.md §2/§3). Sin efectos de lado: no
// llama a AWS aquí, para poder probar la transformación de forma aislada.
// La persistencia (transacción idempotente) vive en `./repository.ts`.

import { ulid } from 'ulid';
import type {
  LegacyMember,
  Member,
  MembershipStatus,
  MembershipType,
} from '@activa-club/shared-types';

import { keys } from '../lib/dynamo';

/**
 * Ítem `Member` migrado. `GSI1PK`/`GSI1SK` (resolución por `cognitoSub`) se
 * omiten deliberadamente: un socio migrado aún no tiene cuenta digital
 * (`cognitoSub = null`), por lo que no debe aparecer en GSI1 hasta que
 * `POST /activation/complete` lo enlace (fuera del alcance de US-009; ver
 * docs/architecture/adr/ADR-0002-autenticacion-cognito-roles.md). No hay una
 * nota explícita sobre este caso en modelo-dynamodb.md §3.1: se deja
 * documentado aquí como decisión de implementación a confirmar con Arquitecto.
 */
export interface MigratedMemberItem extends Member {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
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

export interface MigratedMembershipPeriodItem {
  PK: string;
  SK: string;
  GSI2PK?: string;
  GSI2SK?: string;
  entityType: 'MembershipPeriod';
  membershipId: string;
  type: MembershipType;
  startedAt: string;
  endsAt: string;
  status: MembershipStatus;
  paymentId: null;
  createdAt: string;
}

export interface TransformedLegacyMember {
  member: MigratedMemberItem;
  uniqueDni: UniqueConstraintItem;
  uniqueEmail: UniqueConstraintItem;
  membershipPeriod: MigratedMembershipPeriodItem;
}

export interface TransformDeps {
  /** Fecha de hoy en zona America/Lima, formato `YYYY-MM-DD` (RN-MIG-06). */
  todayLima: string;
  memberId?: string;
  membershipId?: string;
  /** Marca de tiempo ISO usada como `createdAt`/`updatedAt` (inyectable en pruebas). */
  now?: string;
}

/** Fecha de hoy en zona America/Lima como `YYYY-MM-DD` (comparable lexicográficamente). */
export function limaDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const from = Date.parse(`${fromDateOnly}T00:00:00Z`);
  const to = Date.parse(`${toDateOnly}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Deriva `membershipStatus` a partir de `saldoPendiente` y `fin`
 * (docs/data/mapeo-migracion.md §3). El orden de las condiciones es el de la
 * tabla del documento: deuda gana sobre vencimiento, y vencimiento gana sobre
 * "por vencer".
 */
export function deriveMembershipStatus(
  fin: string,
  saldoPendiente: number,
  todayLima: string,
): MembershipStatus {
  if (saldoPendiente > 0) return 'DEBT';
  if (fin < todayLima) return 'EXPIRED';
  if (daysBetween(todayLima, fin) <= 7) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

/**
 * Transforma un socio del JSON on-premise (ya validado con
 * `legacyMemberSchema` de `packages/validation`) en el conjunto de ítems
 * DynamoDB que se escriben en una sola transacción (mapeo-migracion.md §2).
 */
export function transformLegacyMember(
  legacy: LegacyMember,
  deps: TransformDeps,
): TransformedLegacyMember {
  const memberId = deps.memberId ?? ulid();
  const membershipId = deps.membershipId ?? ulid();
  const now = deps.now ?? new Date().toISOString();
  const emailLower = legacy.email.trim().toLowerCase();
  const membershipStatus = deriveMembershipStatus(
    legacy.membresia.fin,
    legacy.saldoPendiente,
    deps.todayLima,
  );
  const isVigente = membershipStatus !== 'EXPIRED';

  const member: MigratedMemberItem = {
    ...keys.member(memberId),
    GSI2PK: 'MEMBER#STATUS#MIGRATED',
    GSI2SK: `${now}#${memberId}`,
    entityType: 'Member',
    memberId,
    legacyId: legacy.legacyId,
    dni: legacy.dni,
    email: emailLower,
    firstName: legacy.nombres,
    lastName: legacy.apellidos,
    phone: legacy.telefono ?? null,
    origin: 'MIGRATED',
    memberStatus: 'MIGRATED',
    cognitoSub: null,
    rejectionReason: null,
    membershipType: legacy.membresia.tipo,
    membershipStatus,
    membershipStartedAt: legacy.membresia.inicio,
    membershipEndsAt: legacy.membresia.fin,
    outstandingBalance: legacy.saldoPendiente,
    autoRenew: false,
    createdAt: now,
    updatedAt: now,
  };

  const uniqueDni: UniqueConstraintItem = {
    ...keys.uniqueDni(legacy.dni),
    entityType: 'UniqueDni',
    memberId,
  };

  const uniqueEmail: UniqueConstraintItem = {
    ...keys.uniqueEmail(emailLower),
    entityType: 'UniqueEmail',
    memberId,
  };

  const membershipPeriod: MigratedMembershipPeriodItem = {
    ...keys.membershipPeriod(memberId, legacy.membresia.inicio, membershipId),
    ...(isVigente ? { GSI2PK: 'MEMBERSHIP#ACTIVE', GSI2SK: legacy.membresia.fin } : {}),
    entityType: 'MembershipPeriod',
    membershipId,
    type: legacy.membresia.tipo,
    startedAt: legacy.membresia.inicio,
    endsAt: legacy.membresia.fin,
    status: membershipStatus,
    paymentId: null,
    createdAt: now,
  };

  return { member, uniqueDni, uniqueEmail, membershipPeriod };
}
