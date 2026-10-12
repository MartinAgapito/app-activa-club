// Aviso al titular por un cambio de estado de su reserva (US-044, RN-NOT-04).
//
// Reglas (EP-05):
//   - Solo se avisa al TITULAR; nunca a participantes ni invitados (criterio 7).
//   - Se invoca DESPUÉS de que la operación de negocio ya tuvo éxito; nada de
//     lo que ocurra aquí cambia la respuesta ni los errores (criterio 9).
//   - `entityId` = `reservationId`: junto con el evento y el socio forma la
//     clave de idempotencia (un reintento no duplica el aviso).
//   - Nunca lanza: cualquier fallo (lectura del recurso, emisor, programación)
//     se registra y se descarta.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation } from '@activa-club/shared-types';

import { logger } from '../lib/logger';
import { emitNotification } from '../notifications';
import { getResourceById } from '../resources/repository';

/** Texto de respaldo si el nombre de la instalación no pudo resolverse. */
const FALLBACK_RESOURCE_NAME = 'la instalación';

export type ReservationNotification =
  | { event: 'RESERVATION_CONFIRMED' }
  | { event: 'RESERVATION_APPROVED' }
  | { event: 'RESERVATION_REJECTED'; reason: string }
  | { event: 'RESERVATION_CANCELLED'; cancelledBy: 'MEMBER' | 'ADMIN' };

export interface NotifyReservationHolderInput {
  client: DynamoDBDocumentClient;
  reservation: Pick<
    Reservation,
    'reservationId' | 'resourceId' | 'holderMemberId' | 'startsAt' | 'endsAt'
  >;
  notification: ReservationNotification;
  /** Nombre de la instalación si el orquestador ya lo leyó (evita una lectura). */
  resourceName?: string;
  now: string;
}

async function resolveResourceName(
  client: DynamoDBDocumentClient,
  resourceId: string,
): Promise<string> {
  try {
    const resource = await getResourceById(client, resourceId);
    return typeof resource?.name === 'string' && resource.name
      ? resource.name
      : FALLBACK_RESOURCE_NAME;
  } catch {
    return FALLBACK_RESOURCE_NAME;
  }
}

/** Emite el aviso al titular. No lanza nunca. */
export async function notifyReservationHolder(input: NotifyReservationHolderInput): Promise<void> {
  const { client, reservation, notification, now } = input;
  try {
    const resourceName =
      input.resourceName ?? (await resolveResourceName(client, reservation.resourceId));
    const slot = { resourceName, startsAt: reservation.startsAt, endsAt: reservation.endsAt };
    const base = {
      entityId: reservation.reservationId,
      memberId: reservation.holderMemberId,
      now,
    };
    const deps = { client };

    switch (notification.event) {
      case 'RESERVATION_CONFIRMED':
      case 'RESERVATION_APPROVED':
        await emitNotification({ ...base, event: notification.event, data: slot }, deps);
        break;
      case 'RESERVATION_REJECTED':
        await emitNotification(
          {
            ...base,
            event: 'RESERVATION_REJECTED',
            data: { ...slot, reason: notification.reason },
          },
          deps,
        );
        break;
      case 'RESERVATION_CANCELLED':
        await emitNotification(
          {
            ...base,
            event: 'RESERVATION_CANCELLED',
            data: { ...slot, cancelledBy: notification.cancelledBy },
          },
          deps,
        );
        break;
    }
  } catch (error) {
    logger.error('No se pudo emitir el aviso de la reserva', {
      requestId: 'reservation-notify',
      entityType: 'Reservation',
      action: 'RESERVATION_NOTIFY',
      outcome: 'FAILURE',
      event: notification.event,
      reservationId: reservation.reservationId,
      reason: error instanceof Error && error.name ? error.name : 'UnknownError',
    });
  }
}
