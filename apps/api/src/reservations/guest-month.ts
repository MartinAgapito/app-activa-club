// Cálculo del mes calendario del invitado externo para el tope de dos
// visitas mensuales (RN-RES-05, US-031: "El mes del contador de invitado se
// calcula en zona América/Lima (modelo de datos §2), no en UTC").
//
// `GuestMonthlyCounter.SK = MONTH#<yyyy-mm>` (modelo de datos §3.10) se
// resuelve sobre este valor: dos reservas con `startsAt` en instantes UTC
// distintos pueden caer en el mismo mes de Lima (o en meses distintos aunque
// el `startsAt` UTC comparta fecha), así que el cálculo no puede hacerse con
// `Date#getUTCMonth()` ni por sustring de un ISO en UTC.

import { limaMonthKey } from './time';

/**
 * Mes calendario (`YYYY-MM`, hora local del club) al que pertenece la reserva
 * cuya franja empieza en `reservationStartsAt`, para efectos del contador
 * mensual de visitas del invitado externo (RN-RES-05).
 *
 * Nota de borde de cambio de mes: `reservationStartsAt` cerca de la
 * medianoche de Lima en el último día del mes puede caer, en UTC, dentro del
 * primer día del mes calendario siguiente (Lima está detrás de UTC). Por eso
 * esta función nunca opera sobre el string ISO en crudo: siempre pasa por
 * `limaMonthKey`, que resuelve el offset real de la zona antes de leer el mes.
 */
export function guestMonthlyCounterMonth(reservationStartsAt: string): string {
  return limaMonthKey(new Date(reservationStartsAt));
}
