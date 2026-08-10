// Cálculo de solapamiento (overlap) entre dos intervalos de tiempo.
//
// Es la pieza de dominio más reutilizada de EP-04 (sprint-3.md, "Capacidad de
// trabajo paralelo": "el cálculo de solapamiento de intervalos ... es lógica
// pura: se puede escribir y probar en la Ola 1"). Un solo predicado sirve a
// tres reglas de negocio distintas, que solo difieren en *qué* intervalos se
// comparan:
//
// - RN-RES-07 (franjas de disponibilidad / cruces por recurso, US-029/US-030):
//   la ventana de la reserva candidata contra las ventanas de otras reservas
//   activas y bloqueos de mantenimiento del mismo recurso.
// - RN-RES-08 (superposición de participantes, US-031): la ventana de la
//   reserva candidata contra las ventanas de otras reservas activas del mismo
//   sujeto (socio o invitado), sin importar el recurso.
// - RN-RES-10 (indirectamente): franjas ya pasadas se calculan comparando el
//   instante actual contra `startsAt`, no con este predicado, pero comparte el
//   mismo módulo por cohesión temporal (ver `slots.ts`).

/** Acepta tanto instantes UTC en ISO-8601 (formato de persistencia) como `Date`. */
export type TimePoint = string | Date;

function toEpochMillis(point: TimePoint): number {
  return typeof point === 'string' ? new Date(point).getTime() : point.getTime();
}

/**
 * `true` si el intervalo semiabierto `[aStart, aEnd)` se solapa con
 * `[bStart, bEnd)`.
 *
 * Semiabierto a propósito: dos reservas consecutivas donde una termina
 * exactamente cuando la otra empieza (p. ej. fútbol 11:00-12:30 seguido de
 * 12:30-14:00) **no** se consideran un cruce. Ningún criterio de aceptación de
 * US-029/US-030/US-031 pide lo contrario, y tratar el instante de contacto
 * como cruce impediría reservar franjas consecutivas legítimas, que es
 * justamente el caso más común de uso intensivo de una cancha.
 */
export function intervalsOverlap(
  aStart: TimePoint,
  aEnd: TimePoint,
  bStart: TimePoint,
  bEnd: TimePoint,
): boolean {
  const aStartMs = toEpochMillis(aStart);
  const aEndMs = toEpochMillis(aEnd);
  const bStartMs = toEpochMillis(bStart);
  const bEndMs = toEpochMillis(bEnd);

  return aStartMs < bEndMs && bStartMs < aEndMs;
}
