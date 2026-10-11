// Regla única de vigencia de membresía (US-038, RN-PAG-06, RN-RES-12,
// RN-ANL-02; docs/data/mapeo-migracion.md §3).
//
// Un solo lugar define qué significa "por vencer" y "vencida", y lo reutilizan:
// - la migración (`../migration/transform.ts`),
// - la activación (`../activation/transform.ts`, vía `deriveMembershipStatus`),
// - el proceso diario de vencimiento (`./expire-memberships.ts`),
// - la defensa en profundidad de `POST /reservations` (`../reservations/create.ts`).
//
// Puro, sin efectos de lado ni AWS: el "hoy" lo pasa siempre el llamante.
// Todas las fechas se comparan como fecha calendario en America/Lima.

import type { MembershipStatus } from '@activa-club/shared-types';

/** Días (inclusive) antes del vencimiento a partir de los cuales una membresía está "por vencer". */
export const EXPIRING_SOON_THRESHOLD_DAYS = 7;

/** Fecha de `date` en zona America/Lima como `YYYY-MM-DD` (comparable lexicográficamente). */
export function limaDateOnly(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Normaliza un fin de vigencia a su fecha calendario de Lima (`YYYY-MM-DD`).
 * La migración guarda `endsAt` como fecha sin hora (ya es fecha de Lima); los
 * pagos (US-021) lo guardan como instante ISO UTC, que hay que convertir.
 */
export function toLimaDate(endsAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(endsAt)) return endsAt;
  return limaDateOnly(new Date(endsAt));
}

/** Días calendario de `fromDateOnly` a `toDateOnly` (ambas `YYYY-MM-DD`); negativo si `to` es anterior. */
export function daysBetween(fromDateOnly: string, toDateOnly: string): number {
  const from = Date.parse(`${fromDateOnly}T00:00:00Z`);
  const to = Date.parse(`${toDateOnly}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/** Suma `days` días calendario a una fecha `YYYY-MM-DD` (sin efectos de zona horaria). */
export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const ms = Date.parse(`${dateOnly}T00:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Clasificación temporal pura de un fin de vigencia respecto de "hoy" (Lima). */
export type VigencyBand = 'EXPIRED' | 'EXPIRING_SOON' | 'ACTIVE';

/**
 * Venció = su fecha de Lima es anterior a hoy. "Vence hoy" todavía es vigente
 * (por vencer). Por vencer = faltan `EXPIRING_SOON_THRESHOLD_DAYS` días o
 * menos, inclusive.
 */
export function classifyVigency(endsAt: string, todayLima: string): VigencyBand {
  const endsLima = toLimaDate(endsAt);
  if (endsLima < todayLima) return 'EXPIRED';
  if (daysBetween(todayLima, endsLima) <= EXPIRING_SOON_THRESHOLD_DAYS) return 'EXPIRING_SOON';
  return 'ACTIVE';
}

/** `true` si la vigencia ya pasó (fecha de Lima anterior a hoy). */
export function hasMembershipEnded(endsAt: string, todayLima: string): boolean {
  return classifyVigency(endsAt, todayLima) === 'EXPIRED';
}

/**
 * Deriva `membershipStatus` a partir de `saldoPendiente` y `fin`
 * (docs/data/mapeo-migracion.md §3). El orden de las condiciones es el de la
 * tabla del documento: deuda gana sobre vencimiento, y vencimiento gana sobre
 * "por vencer". Usado por migración y activación.
 */
export function deriveMembershipStatus(
  fin: string,
  saldoPendiente: number,
  todayLima: string,
): MembershipStatus {
  if (saldoPendiente > 0) return 'DEBT';
  return classifyVigency(fin, todayLima);
}

/** Destinos posibles de una transición automática por vencimiento. */
export type VigencyTransitionTarget = 'EXPIRING_SOON' | 'EXPIRED';

const TRANSITIONABLE_STATUSES: ReadonlySet<MembershipStatus> = new Set(['ACTIVE', 'EXPIRING_SOON']);

export interface ResolveVigencyTransitionInput {
  membershipStatus: MembershipStatus;
  membershipEndsAt: string | null;
  todayLima: string;
}

/**
 * Transición automática que corresponde a un socio (US-038, criterios 2-4):
 * - `ACTIVE`/`EXPIRING_SOON` vencido -> `EXPIRED`.
 * - `ACTIVE` con vencimiento dentro del umbral -> `EXPIRING_SOON`.
 * - `DEBT`, `NONE`, `EXPIRED` (o sin fecha de fin) -> sin cambio (`null`):
 *   la deuda tiene prioridad sobre la vigencia y un socio sin membresía no vence.
 * Compara contra la fecha, no contra "ayer": un proceso caído varios días se
 * pone al día en la siguiente ejecución.
 */
export function resolveVigencyTransition(
  input: ResolveVigencyTransitionInput,
): VigencyTransitionTarget | null {
  if (!TRANSITIONABLE_STATUSES.has(input.membershipStatus)) return null;
  if (!input.membershipEndsAt) return null;

  const band = classifyVigency(input.membershipEndsAt, input.todayLima);
  if (band === 'EXPIRED') return 'EXPIRED';
  if (band === 'EXPIRING_SOON' && input.membershipStatus === 'ACTIVE') return 'EXPIRING_SOON';
  return null;
}
