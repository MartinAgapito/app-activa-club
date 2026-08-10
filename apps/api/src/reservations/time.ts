// Conversión de horarios entre la hora local del club (America/Lima) y UTC
// (docs/data/modelo-dynamodb.md §2: "las fechas se almacenan en UTC ISO-8601;
// las reglas de negocio con calendario -cancelación 24h, expiración, mes del
// invitado- se evalúan en zona America/Lima").
//
// `../migration/transform.ts` ya resuelve el sentido UTC -> Lima
// (`limaDateOnly`, para "hoy" en la migración). Este módulo agrega el sentido
// que faltaba y que necesita EP-04: Lima -> UTC, imprescindible para construir
// instantes a partir de `opensAt`/`closesAt` (hora local del recurso, formato
// "HH:mm") y de la fecha del querystring de disponibilidad
// (`GET /resources/{id}/availability?date=YYYY-MM-DD`, también en hora local).
//
// Por qué no se hardcodea el offset -05:00: aunque Perú no observa horario de
// verano desde 1990 (y por eso el offset es estable en la práctica), calcular
// el offset con `Intl.DateTimeFormat` en vez de asumirlo evita que el cálculo
// se rompa en silencio si esa política cambiara, y deja explícito en el código
// *por qué* el resultado es siempre UTC-5 en vez de dejarlo como una constante
// mágica sin justificación.

export const CLUB_TIME_ZONE = 'America/Lima';

/**
 * Offset de `timeZone` respecto de UTC, en minutos, válido para el instante
 * `at` (positivo si la zona está adelantada respecto de UTC). Para
 * `America/Lima` da siempre -300 (UTC-5), pero el cálculo no asume eso: lee el
 * offset real a partir de cómo `Intl` representa `at` en esa zona.
 */
function timeZoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');

  // Instante que resultaría de releer los mismos dígitos de calendario/hora
  // como si fueran UTC: la diferencia contra `at` es el offset de la zona.
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

/**
 * Convierte una fecha y hora **local del club** (`dateOnly` = `YYYY-MM-DD`,
 * `time` = `HH:mm`, zona `America/Lima`) al instante UTC correspondiente.
 *
 * Caso de borde de cambio de día: una hora local tarde (p. ej. `22:00`, el
 * `closesAt` de parrilla/salón) cae en el **día UTC siguiente**, porque Lima
 * está detrás de UTC (UTC-5). Por eso esta función nunca concatena `dateOnly`
 * con `time` y asume que comparten fecha en UTC: siempre resuelve el offset y
 * corrige.
 */
export function limaWallTimeToUtc(dateOnly: string, time: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    hour === undefined ||
    minute === undefined ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    throw new RangeError(`Fecha u hora inválida: date="${dateOnly}" time="${time}"`);
  }

  // Primera aproximación: leer los mismos dígitos como si ya fueran UTC.
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  // `Date.UTC` normaliza silenciosamente los valores fuera de rango (p. ej.
  // mes 13 se convierte en enero del año siguiente): comparar contra lo que
  // `guess` reporta es la forma de detectar una fecha u hora que nunca
  // existió, sin reimplementar un calendario a mano.
  if (
    guess.getUTCFullYear() !== year ||
    guess.getUTCMonth() !== month - 1 ||
    guess.getUTCDate() !== day ||
    guess.getUTCHours() !== hour ||
    guess.getUTCMinutes() !== minute
  ) {
    throw new RangeError(`Fecha u hora inválida: date="${dateOnly}" time="${time}"`);
  }

  const offsetMinutes = timeZoneOffsetMinutes(guess, CLUB_TIME_ZONE);
  // El offset de Lima es constante durante todo el año (sin horario de
  // verano), así que una sola corrección alcanza incluso cerca de la
  // medianoche o de un cambio de mes; se deja como función separada
  // (`timeZoneOffsetMinutes`) para que un futuro cambio de política de zona
  // horaria no rompa el cálculo en silencio.
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

/** Fecha calendario (`YYYY-MM-DD`) de `at` en zona `America/Lima`. */
export function limaCalendarDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CLUB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Mes calendario (`YYYY-MM`) de `at` en zona `America/Lima`. Base del tope de
 * dos visitas mensuales por invitado externo (RN-RES-05,
 * `GuestMonthlyCounter.SK = MONTH#<yyyy-mm>`, modelo de datos §3.10): el mes
 * se calcula sobre la hora local del club, no sobre UTC.
 */
export function limaMonthKey(at: Date): string {
  return limaCalendarDate(at).slice(0, 7);
}
