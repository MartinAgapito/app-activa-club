// Cálculo puro de la vigencia de membresía tras un pago (US-021, sección
// "Reglas de cálculo de vigencia"; RN-PAG-01).
//
// - Primer pago (socio sin membresía vigente: `membershipStatus` en
//   `EXPIRED`/`DEBT`/`NONE`, típicamente tras `memberStatus=APPROVED`): la
//   vigencia empieza en la fecha de confirmación del pago.
// - Renovación anticipada (socio con membresía vigente: `ACTIVE` o
//   `EXPIRING_SOON`): la vigencia nueva se encadena al `membershipEndsAt`
//   vigente, para no perder días ya pagados.
//
// Sin efectos de lado: no llama a AWS ni depende de reloj de sistema salvo el
// que le pase el llamante (mismo criterio que `../migration/transform.ts`).

import type { ISODateString, MembershipStatus, MembershipType } from '@activa-club/shared-types';

/** Estados que cuentan como "membresía vigente": el pago se encadena en vez de reiniciar. */
const RENEWABLE_STATUSES: ReadonlySet<MembershipStatus> = new Set(['ACTIVE', 'EXPIRING_SOON']);

export type MembershipCycleKind = 'FIRST_PAYMENT' | 'EARLY_RENEWAL';

export interface ResolveMembershipCycleInput {
  membershipType: MembershipType;
  /** Fecha de confirmación del pago (ISO). Punto de partida en un primer pago. */
  paymentConfirmedAt: ISODateString;
  /** `membershipStatus` del socio antes de este pago. */
  currentMembershipStatus: MembershipStatus;
  /** `membershipEndsAt` vigente del socio antes de este pago (`null` si nunca tuvo una). */
  currentMembershipEndsAt: ISODateString | null;
}

export interface MembershipCycleResult {
  kind: MembershipCycleKind;
  startedAt: ISODateString;
  endsAt: ISODateString;
}

/**
 * Suma `months` meses a `date` en UTC, preservando hora/minuto/segundo y
 * ajustando (clamp) al último día del mes destino cuando el día original no
 * existe ahí (p. ej. 31 de enero + 1 mes -> 28/29 de febrero). Sin librería de
 * fechas externa (no es una dependencia del proyecto, ver `package.json`).
 */
function addUtcMonths(date: Date, months: number): Date {
  const originalDay = date.getUTCDate();
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return shifted;
}

/** `+1 mes` (`MONTHLY`) o `+1 año` (`ANNUAL`, implementado como `+12 meses` para el mismo ajuste de fin de mes). */
function addMembershipDuration(startedAt: ISODateString, type: MembershipType): ISODateString {
  const start = new Date(startedAt);
  const months = type === 'MONTHLY' ? 1 : 12;
  return addUtcMonths(start, months).toISOString();
}

/**
 * Resuelve el nuevo período de membresía tras un pago confirmado (criterio 1,
 * 3; casos alternativos "renovación anticipada"). Encadena desde
 * `currentMembershipEndsAt` solo si el socio está `ACTIVE`/`EXPIRING_SOON` y
 * de verdad tiene una fecha de fin registrada; en cualquier otro caso (sin
 * membresía vigente) parte de la fecha de confirmación del pago.
 */
export function resolveMembershipCycle(input: ResolveMembershipCycleInput): MembershipCycleResult {
  const isEarlyRenewal =
    RENEWABLE_STATUSES.has(input.currentMembershipStatus) && input.currentMembershipEndsAt !== null;

  const startedAt = isEarlyRenewal
    ? (input.currentMembershipEndsAt as ISODateString)
    : input.paymentConfirmedAt;

  return {
    kind: isEarlyRenewal ? 'EARLY_RENEWAL' : 'FIRST_PAYMENT',
    startedAt,
    endsAt: addMembershipDuration(startedAt, input.membershipType),
  };
}
