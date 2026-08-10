// Resolución de `endsAt` a partir de `startsAt` + `blockMinutes` del recurso
// (US-030, "Reglas de resolución (funcionales)": "`endsAt` lo calcula el
// servidor ... nunca se acepta un `endsAt` del cliente").
//
// Aritmética pura sobre instantes UTC: no requiere conversión de zona horaria
// (a diferencia de `slots.ts`, que sí construye instantes a partir de una hora
// *local* del club). `blockMinutes` es una duración, no un punto en el
// calendario, así que sumarla en UTC o en América/Lima da el mismo resultado.

/**
 * Calcula `endsAt = startsAt + blockMinutes` (US-030, criterio 5).
 *
 * Devuelve un ISO-8601 UTC, igual que `startsAt` de entrada, para que el
 * resultado sea directamente persistible en `Reservation.endsAt` (modelo de
 * datos §3.8) sin conversiones adicionales.
 */
export function resolveReservationEndsAt(startsAt: string, blockMinutes: number): string {
  if (!Number.isInteger(blockMinutes) || blockMinutes <= 0) {
    throw new RangeError(`blockMinutes debe ser un entero positivo: ${blockMinutes}`);
  }
  const startMs = new Date(startsAt).getTime();
  if (Number.isNaN(startMs)) {
    throw new RangeError(`startsAt inválido: "${startsAt}"`);
  }
  return new Date(startMs + blockMinutes * 60_000).toISOString();
}
