// Orquestador de `POST /reservations/{reservationId}/cancel` para `member`
// (US-033, criterios 5-12, RN-RES-05/06/10, docs/api/contratos-api.md §7).
//
// Alcance de esta historia: solo la cancelación del socio **titular**, sujeta
// a la ventana de 24 horas (RN-RES-10). La cancelación administrativa sin esa
// restricción (contrato: el mismo endpoint también admite `admin`) es
// US-036, deliberadamente fuera de alcance aquí — el handler
// (`../handlers/reservations/cancel.ts`) solo autoriza `member` por ahora;
// habilitar `admin` en esa misma ruta es tarea de esa historia, no de esta.
//
// Visibilidad ajena (criterio 9): mismo criterio que el detalle
// (`./get-by-id.ts`) — "no titular" se trata igual que "no existe" (404).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CancelReservationResponse } from '@activa-club/shared-types';

import { recordAuditLog } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import { canCancelReservation } from './cancellation';
import { guestMonthlyCounterMonth } from './guest-month';
import { isActiveReservationStatus } from './reservation-status';
import type { GuestMonthlyCounterRecord } from './repository';
import {
  getGuestMonthlyCounter,
  getReservationById,
  getReservationParticipants,
  writeCancellation,
} from './repository';

export interface CancelReservationInput {
  cognitoSub: string;
  reservationId: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable ("ahora"), para pruebas deterministas del borde de 24h (criterio 6). */
  now?: Date;
}

export async function cancelReservation(
  input: CancelReservationInput,
): Promise<CancelReservationResponse> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  const reservation = await getReservationById(client, input.reservationId);
  if (!reservation || reservation.holderMemberId !== member.memberId) {
    // Criterio 9: "no titular" se trata igual que "no existe" (ver cabecera).
    throw new AppError('NOT_FOUND', 'No se encontró la reserva indicada.');
  }

  if (!isActiveReservationStatus(reservation.reservationStatus)) {
    // Criterio 8: ya CANCELLED o REJECTED. Rechazo "en frío" antes de tocar
    // nada; la condición de la cabecera dentro de `writeCancellation` es la
    // garantía real contra la carrera de una decisión concurrente.
    throw new AppError('CONFLICT', 'La reserva ya no está activa; no puede cancelarse nuevamente.');
  }

  if (!canCancelReservation(reservation.startsAt, now)) {
    // Criterio 6/7: aplica también a PENDING_APPROVAL (RN-RES-10), el socio
    // no necesita esperar la decisión del administrador para cancelar.
    throw new AppError(
      'CANCELLATION_TOO_LATE',
      'Solo se puede cancelar hasta 24 horas antes del inicio de la reserva.',
    );
  }

  // Criterio 10 (RN-RES-05): un contador por cada invitado externo distinto
  // entre los participantes de la reserva, leído antes de construir la
  // transacción de cancelación (`./repository.ts`, `writeCancellation` /
  // `buildGuestMonthlyCounterDecrementTransactItem`).
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
  // decrementa ese invitado en particular — no bloquea la cancelación de la
  // reserva en sí.

  const outcome = await writeCancellation(client, {
    reservationId: reservation.reservationId,
    cancelledAt: nowIso,
    guestCounters,
  });
  if (outcome === 'ALREADY_DECIDED') {
    // Carrera cerrada por la condición de la cabecera dentro de la
    // transacción (mismo código que el rechazo "en frío" de arriba).
    throw new AppError('CONFLICT', 'La reserva ya no está activa; no puede cancelarse nuevamente.');
  }

  // Rastro de auditoría (criterio 12): deja registrado el evento
  // `RESERVATION_CANCELLED` previsto por el contrato, sin construir el envío
  // en sí (EP-05, fuera de alcance) — mismo criterio que `RESERVATION_CREATED`
  // en `./create.ts`.
  await recordAuditLog(client, {
    action: 'RESERVATION_CANCELLED',
    actor: { actorId: member.memberId, actorRole: 'member' },
    targetType: 'Reservation',
    targetId: reservation.reservationId,
    metadata: { resourceId: reservation.resourceId, startsAt: reservation.startsAt },
    now: nowIso,
  });

  return { reservationId: reservation.reservationId, reservationStatus: 'CANCELLED' };
}
