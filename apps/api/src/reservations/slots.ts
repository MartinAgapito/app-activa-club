// Generación de franjas horarias de un recurso para un día dado, y resolución
// pura del `status` de cada franja (US-029, "Reglas de cálculo de franjas
// (funcionales)"; contrato §6).
//
// Deliberadamente separado en dos funciones de responsabilidad única:
// - `generateResourceSlots`: solo construye las ventanas [startsAt, endsAt) del
//   día, sin saber nada de reservas ni mantenimiento (no toca DynamoDB).
// - `resolveSlotStatus`: solo aplica la regla de precedencia sobre banderas ya
//   calculadas por el llamante (que sí conoce el resultado de las consultas a
//   GSI3, fuera de alcance de este módulo).
// Esto deja lista la mitad "sin AWS" de US-029 desde la Ola 1: el handler de
// la Ola 3 solo necesita consultar GSI3, convertir el resultado en las tres
// banderas booleanas y llamar a `resolveSlotStatus` por franja.

import type { AvailabilitySlotStatus } from '@activa-club/shared-types';

import { limaWallTimeToUtc } from './time';

export interface ResourceScheduleInput {
  /** Hora de apertura del recurso, hora local del club, formato `HH:mm`. */
  opensAt: string;
  /** Hora de cierre del recurso, hora local del club, formato `HH:mm`. */
  closesAt: string;
  /** Duración de cada franja en minutos (p. ej. 90 para fútbol, 300 para parrilla). */
  blockMinutes: number;
}

export interface TimeSlot {
  /** Instante UTC ISO-8601 de inicio de la franja. */
  startsAt: string;
  /** Instante UTC ISO-8601 de fin de la franja. */
  endsAt: string;
}

/**
 * Genera las franjas de `blockMinutes` entre `opensAt` y `closesAt` de un
 * recurso para la fecha calendario `dateLima` (`YYYY-MM-DD`, hora local del
 * club), devueltas en UTC ISO-8601 (convención del modelo de datos §2).
 *
 * "Una franja que no cabe completa antes de `closesAt` no se ofrece" (US-029,
 * criterio 2/3): por eso el corte de la última franja usa `<=`, no un
 * redondeo — si el resto del día no alcanza para un bloque completo, ese
 * resto simplemente no genera franja.
 */
export function generateResourceSlots(
  schedule: ResourceScheduleInput,
  dateLima: string,
): TimeSlot[] {
  if (!Number.isInteger(schedule.blockMinutes) || schedule.blockMinutes <= 0) {
    throw new RangeError(`blockMinutes debe ser un entero positivo: ${schedule.blockMinutes}`);
  }

  const opensAtUtc = limaWallTimeToUtc(dateLima, schedule.opensAt);
  const closesAtUtc = limaWallTimeToUtc(dateLima, schedule.closesAt);
  if (closesAtUtc.getTime() <= opensAtUtc.getTime()) {
    throw new RangeError(
      `closesAt (${schedule.closesAt}) debe ser posterior a opensAt (${schedule.opensAt}).`,
    );
  }

  const blockMs = schedule.blockMinutes * 60_000;
  const slots: TimeSlot[] = [];

  for (
    let cursorMs = opensAtUtc.getTime();
    cursorMs + blockMs <= closesAtUtc.getTime();
    cursorMs += blockMs
  ) {
    slots.push({
      startsAt: new Date(cursorMs).toISOString(),
      endsAt: new Date(cursorMs + blockMs).toISOString(),
    });
  }

  return slots;
}

/**
 * `true` si una franja cuyo inicio es `slotStartsAt` ya empezó respecto de
 * `now` (US-029, criterio 8: "Las franjas ya pasadas del día en curso se
 * devuelven con `available=false` y `status=PAST`").
 *
 * Se usa `<` estricto (no `<=`): una franja cuyo `startsAt` coincide
 * exactamente con `now` todavía no "ya pasó" en sentido literal. El contrato
 * no define un borde exacto para este caso (a diferencia de la cancelación de
 * 24h, US-033, que sí lo define explícitamente), así que se documenta aquí la
 * elección para que no quede implícita.
 */
export function isSlotPast(slotStartsAt: string | Date, now: Date): boolean {
  const startMs =
    typeof slotStartsAt === 'string' ? new Date(slotStartsAt).getTime() : slotStartsAt.getTime();
  return startMs < now.getTime();
}

export interface ResolveSlotStatusInput {
  /** La franja ya empezó respecto del momento de la consulta. */
  isPast: boolean;
  /**
   * La franja está cubierta por un `MaintenanceBlock` vigente, o el recurso
   * completo está en `resourceStatus=MAINTENANCE`.
   */
  isMaintenance: boolean;
  /** La franja se solapa con al menos una reserva activa del recurso (RN-RES-07). */
  isReserved: boolean;
}

/**
 * Resuelve el `status` de una franja aplicando la precedencia documentada en
 * el contrato (§6) y en US-029, criterio "cuando aplica más de un motivo":
 * **`PAST` → `MAINTENANCE` → `RESERVED`** → `AVAILABLE` si ninguna bandera
 * aplica.
 *
 * Ejemplo del orden: una franja bloqueada por mantenimiento que además tiene
 * una reserva previa (las reservas existentes no se cancelan solas al crear
 * un bloqueo, US-035) se informa como `MAINTENANCE`, no como `RESERVED` — el
 * socio necesita saber que la franja no es reservable *por mantenimiento*,
 * más allá de que también esté ocupada.
 */
export function resolveSlotStatus(input: ResolveSlotStatusInput): AvailabilitySlotStatus {
  if (input.isPast) return 'PAST';
  if (input.isMaintenance) return 'MAINTENANCE';
  if (input.isReserved) return 'RESERVED';
  return 'AVAILABLE';
}

/** `true` exactamente cuando `status === 'AVAILABLE'` (contrato §6: "`available` sigue siendo el campo de decisión"). */
export function isSlotAvailable(status: AvailabilitySlotStatus): boolean {
  return status === 'AVAILABLE';
}
