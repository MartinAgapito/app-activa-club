// Anticipo en la interfaz de la regla de cancelación (RN-RES-10, US-033
// criterios 5, 6 y 13).
//
// Replica la misma función de borde que el backend
// (`apps/api/src/reservations/cancellation.ts`): faltan 24 horas o más para
// `startsAt` -> permitido (borde inclusivo). Es solo una ayuda de
// experiencia de usuario: si el servidor responde `CANCELLATION_TOO_LATE` o
// `CONFLICT`, gana el servidor.

import type { Reservation } from '@activa-club/shared-types';

const CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

const CANCELLABLE_STATUSES: ReadonlySet<Reservation['reservationStatus']> = new Set([
  'CONFIRMED',
  'PENDING_APPROVAL',
  'APPROVED',
]);

/** `true` si al instante `now` faltan 24 horas o más para `startsAt`. */
export function hasCancellationWindow(startsAt: string, now: Date): boolean {
  return new Date(startsAt).getTime() - now.getTime() >= CANCELLATION_WINDOW_MS;
}

export type CancelBlockReason = 'ALREADY_CANCELLED' | 'REJECTED' | 'STARTED' | 'TOO_LATE';

export const CANCEL_BLOCK_COPY: Record<CancelBlockReason, string> = {
  ALREADY_CANCELLED: 'Esta reserva ya fue cancelada.',
  REJECTED: 'Esta reserva fue rechazada, no se puede cancelar.',
  STARTED: 'La reserva ya comenzó o ya pasó, no se puede cancelar.',
  TOO_LATE: 'Faltan menos de 24 horas para el inicio: ya no se puede cancelar.',
};

/** Motivo por el que NO se puede cancelar, o `null` si la interfaz la ofrece. */
export function getCancelBlock(
  reservation: Pick<Reservation, 'reservationStatus' | 'startsAt'>,
  now: Date,
): CancelBlockReason | null {
  if (reservation.reservationStatus === 'CANCELLED') {
    return 'ALREADY_CANCELLED';
  }
  if (reservation.reservationStatus === 'REJECTED') {
    return 'REJECTED';
  }
  if (!CANCELLABLE_STATUSES.has(reservation.reservationStatus)) {
    return 'ALREADY_CANCELLED';
  }
  if (new Date(reservation.startsAt).getTime() <= now.getTime()) {
    return 'STARTED';
  }
  if (!hasCancellationWindow(reservation.startsAt, now)) {
    return 'TOO_LATE';
  }
  return null;
}
