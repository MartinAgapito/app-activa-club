// Utilidades de zona horaria para el club: `America/Lima` (RN-RES, US-029).
//
// Perú no observa horario de verano desde 1994: `America/Lima` es UTC-5 todo
// el año, sin excepciones. Esto permite un desplazamiento fijo en vez de
// depender de una librería de zonas horarias (`Intl` ya cubre el formateo
// de salida hacia el usuario). El backend hace la misma conversión con esta
// misma regla (docs/data/modelo-dynamodb.md §2): horarios operativos en hora
// local del club, persistidos y transportados en UTC ISO-8601.
//
// Esto vive en `lib/format` (y no en `resources/`) porque es lógica pura,
// sin dependencia del contrato de disponibilidad, reutilizable por cualquier
// pantalla que necesite mostrar u operar horarios del club (US-029, US-030,
// US-033, US-035).

const LIMA_UTC_OFFSET_HOURS = 5;

/** Fecha de hoy en `America/Lima`, como `YYYY-MM-DD` (para precargar el
 * selector de día del socio en su propia zona horaria, no la del navegador). */
export function getTodayInLima(referenceDate: Date = new Date()): string {
  const limaMs = referenceDate.getTime() - LIMA_UTC_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(limaMs).toISOString().slice(0, 10);
}

/** Construye el instante UTC (ISO-8601) que corresponde a una hora local del
 * club (`America/Lima`) en un día dado, replicando la convención del
 * contrato (`docs/api/contratos-api.md` §6): `date=2026-07-12` + `06:00`
 * local -> `2026-07-12T11:00:00Z`. */
export function limaLocalTimeToUtcIso(date: string, hhmm: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = hhmm.split(':').map(Number);
  const utcMs = Date.UTC(
    year!,
    (month ?? 1) - 1,
    day,
    (hours ?? 0) + LIMA_UTC_OFFSET_HOURS,
    minutes ?? 0,
  );
  return new Date(utcMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Formatea un instante UTC ISO como hora local del club ("06:00"), para
 * mostrar franjas horarias sin exponer la conversión interna al socio. */
export function formatTimeInLima(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

/** Formatea un rango `startsAt`–`endsAt` en hora local del club, p. ej.
 * "06:00 – 07:30". */
export function formatTimeRangeInLima(startsAt: string, endsAt: string): string {
  return `${formatTimeInLima(startsAt)} – ${formatTimeInLima(endsAt)}`;
}

/** Suma minutos a una hora `HH:mm` y devuelve el resultado en el mismo
 * formato (usado para generar franjas desde `opensAt` hasta `closesAt`). */
export function addMinutesToTime(hhmm: string, minutesToAdd: number): string {
  const [hours, minutes] = hhmm.split(':').map(Number);
  const totalMinutes = (hours ?? 0) * 60 + (minutes ?? 0) + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
}

/** Compara dos horas `HH:mm` (true si `a` es estrictamente posterior a `b`). */
export function isTimeAfter(a: string, b: string): boolean {
  return a > b;
}
