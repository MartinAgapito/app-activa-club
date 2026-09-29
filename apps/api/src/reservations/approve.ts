// Orquestador de `POST /reservations/{reservationId}/approve` para `admin`
// (US-034, criterios 2, 5, 6, 7, 8, 11; RN-RES-02/07, docs/api/contratos-api.md
// §7).
//
// Aprobar no toca la franja ni ningún contador de invitado: la reserva ya la
// ocupaba desde su creación (US-030, `PENDING_APPROVAL` cuenta como activa a
// efectos de cruces, `./reservation-status.ts`), así que este orquestador solo
// valida la transición y cambia el estado de la cabecera
// (`./repository.ts#approveReservation`).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ApproveReservationResponse } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { approveReservation as writeApproval, getReservationById } from './repository';

export interface ApproveReservationInput {
  reservationId: string;
  actor: AuditActor;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable ("ahora"), para pruebas deterministas. */
  now?: Date;
}

/**
 * Aprueba una reserva de parrilla/salón social pendiente (criterio 2,
 * RN-RES-02): `PENDING_APPROVAL -> APPROVED` + auditoría
 * `RESERVATION_APPROVED` (criterio 11).
 */
export async function approveReservation(
  input: ApproveReservationInput,
): Promise<ApproveReservationResponse> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  const existing = await getReservationById(client, input.reservationId);
  if (!existing) {
    throw new AppError('NOT_FOUND', 'No se encontró la reserva indicada.');
  }

  const outcome = await writeApproval(client, input.reservationId, now);
  if (outcome === 'NOT_PENDING') {
    // Criterio 5: ya decidida, cancelada por el socio, o el caso de dos
    // administradores actuando a la vez sobre la misma solicitud (la
    // condición dentro de `approveReservation` cierra la carrera real).
    throw new AppError('RESERVATION_NOT_PENDING', 'La reserva no está pendiente de aprobación.');
  }

  // Rastro de auditoría (criterio 11/12): deja registrado el evento
  // `RESERVATION_APPROVED` previsto por el contrato, sin construir el envío
  // en sí (EP-05, fuera de alcance) — mismo criterio que `RESERVATION_CANCELLED`
  // en `./cancel.ts`.
  await recordAuditLog(client, {
    action: 'RESERVATION_APPROVED',
    actor: input.actor,
    targetType: 'Reservation',
    targetId: outcome.reservationId,
    metadata: { resourceId: outcome.resourceId, startsAt: outcome.startsAt },
    now,
  });

  return { reservationId: outcome.reservationId, reservationStatus: outcome.reservationStatus };
}
