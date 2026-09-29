// Orquestador de `POST /reservations/{reservationId}/reject` para `admin`
// (US-034, criterios 3, 4, 5, 9, 10, 11; RN-RES-02/05/07,
// docs/api/contratos-api.md §7).
//
// Casi un calco de `./cancel.ts` (mismo flujo de lectura previa de
// `GuestMonthlyCounter` por invitado externo antes de escribir la
// transacción), pero condicionado específicamente a `PENDING_APPROVAL` (no al
// conjunto completo de estados activos): solo esa transición puede
// rechazarse.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RejectReservationResponse } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { guestMonthlyCounterMonth } from './guest-month';
import type { GuestMonthlyCounterRecord } from './repository';
import {
  getGuestMonthlyCounter,
  getReservationById,
  getReservationParticipants,
  writeRejection,
} from './repository';

export interface RejectReservationInput {
  reservationId: string;
  reason: string;
  actor: AuditActor;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable ("ahora"), para pruebas deterministas. */
  now?: Date;
}

export async function rejectReservation(
  input: RejectReservationInput,
): Promise<RejectReservationResponse> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const reservation = await getReservationById(client, input.reservationId);
  if (!reservation) {
    throw new AppError('NOT_FOUND', 'No se encontró la reserva indicada.');
  }

  if (reservation.reservationStatus !== 'PENDING_APPROVAL') {
    // Criterio 5: ya aprobada/rechazada, cancelada por el socio antes de la
    // decisión, o confirmada automáticamente (nunca debería llegar aquí, pero
    // se rechaza igual "en frío" antes de tocar nada). La condición dentro de
    // `writeRejection` es la garantía real contra la carrera de dos
    // administradores decidiendo a la vez.
    throw new AppError('RESERVATION_NOT_PENDING', 'La reserva no está pendiente de aprobación.');
  }

  // Criterio 10 (RN-RES-05, caso R-29): un contador por cada invitado externo
  // distinto entre los participantes de la reserva, leído antes de construir
  // la transacción de rechazo (mismo flujo que `./cancel.ts`).
  const participants = await getReservationParticipants(client, reservation.reservationId);
  const guestDnis = [
    ...new Set(
      participants
        .filter((participant) => participant.participantType === 'GUEST' && participant.guestDni)
        .map((participant) => participant.guestDni as string),
    ),
  ];
  const month = guestMonthlyCounterMonth(reservation.startsAt);
  const guestCounters = (
    await Promise.all(guestDnis.map((guestDni) => getGuestMonthlyCounter(client, guestDni, month)))
  ).filter((counter): counter is GuestMonthlyCounterRecord => counter !== undefined);
  // Defensivo: si el contador de algún invitado ya no existiera (no debería
  // ocurrir, se incrementó al crear esta misma reserva), simplemente no se
  // decrementa ese invitado en particular — no bloquea el rechazo en sí.

  const outcome = await writeRejection(client, {
    reservationId: reservation.reservationId,
    rejectionReason: input.reason,
    rejectedAt: nowIso,
    guestCounters,
  });
  if (outcome === 'NOT_PENDING') {
    // Carrera cerrada por la condición de la cabecera dentro de la
    // transacción (mismo código que el rechazo "en frío" de arriba).
    throw new AppError('RESERVATION_NOT_PENDING', 'La reserva no está pendiente de aprobación.');
  }

  // Rastro de auditoría (criterio 11/12): deja registrado el evento
  // `RESERVATION_REJECTED` previsto por el contrato, con el motivo en la
  // metadata, sin construir el envío en sí (EP-05, fuera de alcance).
  await recordAuditLog(client, {
    action: 'RESERVATION_REJECTED',
    actor: input.actor,
    targetType: 'Reservation',
    targetId: reservation.reservationId,
    metadata: { resourceId: reservation.resourceId, reason: input.reason },
    now: nowIso,
  });

  return {
    reservationId: reservation.reservationId,
    reservationStatus: 'REJECTED',
    rejectionReason: input.reason,
  };
}
