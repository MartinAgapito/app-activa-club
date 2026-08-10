// Regla de las 24 horas para cancelación de reservas (RN-RES-10, US-033).
//
// "El borde de las 24 horas se define como permitido cuando faltan 24 horas o
// más" (sprint-3.md, "Aclaraciones de reglas incorporadas en este sprint";
// US-033 criterio 6 y "Casos alternativos": "se define el borde como
// **permitida** cuando faltan 24 horas o más; a partir de 23:59 restantes se
// rechaza. El criterio debe quedar cubierto por una prueba de borde
// explícita").
//
// Es una diferencia de duración (ahora vs. `startsAt`), no una comparación de
// fechas de calendario: por eso no necesita conversión a hora local del club.
// 24 horas son 24 horas sin importar en qué zona se representen, y Perú no
// tiene horario de verano que pudiera desalinear el conteo (a diferencia de
// zonas con DST, donde "24 horas antes" y "el mismo momento del día anterior"
// pueden diferir). La mención expresa a "zona América/Lima" en la historia se
// entiende como "el reloj de referencia es la hora real de Lima", que aquí se
// traduce en que tanto `now` como `startsAt` deben ser instantes UTC
// correctos (ISO-8601 con offset), no en que haga falta reproyectar la resta.

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * `true` si, al momento `now`, faltan 24 horas o más para `startsAt`
 * (RN-RES-10). El borde es **inclusive**: exactamente 24 horas antes todavía
 * permite cancelar.
 */
export function canCancelReservation(startsAt: string | Date, now: Date): boolean {
  const startMs = typeof startsAt === 'string' ? new Date(startsAt).getTime() : startsAt.getTime();
  return startMs - now.getTime() >= CANCELLATION_WINDOW_MS;
}
