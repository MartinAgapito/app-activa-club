// Acceso a datos de `Reservation`/`ReservationParticipant` (US-030,
// docs/data/modelo-dynamodb.md §3.8/3.9/3.16, consulta 19).
//
// Dos responsabilidades separadas:
// - `findResourceOccupancy`: lectura (best-effort, no atómica) de las
//   reservas activas y bloqueos de mantenimiento de un recurso que se
//   solapan con una ventana de tiempo dada. Sirve tanto para decidir el
//   rechazo "en frío" antes de escribir (RN-RES-07/09/11) como, más
//   adelante, para US-029 (disponibilidad de un recurso por día): por eso
//   `window` es un parámetro genérico `{ from, to }`, no algo atado a la
//   duración de una reserva puntual.
// - `writeReservation`: escritura atómica de la reserva completa
//   (`Reservation` + `ReservationParticipant` HOLDER) en una única
//   `TransactWriteItems`, más un tercer ítem interno de candado de
//   concurrencia (`ReservationSlotLock`, §3.16) que es la pieza que de
//   verdad cierra la ventana de carrera del criterio 14 (ver su
//   documentación detallada más abajo, junto a `writeReservation`).

import {
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  MaintenanceBlock,
  Reservation,
  ReservationParticipant,
} from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import { intervalsOverlap } from './overlap';
import { isActiveReservationStatus } from './reservation-status';

export interface ResourceOccupancyWindow {
  /** Instante UTC ISO-8601 inclusivo de inicio de la ventana consultada. */
  from: string;
  /** Instante UTC ISO-8601 exclusivo de fin de la ventana consultada. */
  to: string;
}

export interface ResourceOccupancy {
  /** Reservas activas (`isActiveReservationStatus`) del recurso que se solapan con `window`. */
  activeReservations: Reservation[];
  /** Bloqueos de mantenimiento del recurso que se solapan con `window`. */
  maintenanceBlocks: MaintenanceBlock[];
}

interface EntityTyped {
  entityType?: string;
}

/**
 * Consulta GSI3 (`keys.reservationsByResource`, consulta 19) y discrimina en
 * memoria los dos tipos de ítem que comparten `GSI3PK=RESOURCE#<id>`
 * (`Reservation` y `MaintenanceBlock`, modelo-dynamodb.md §3.8/§3.11) por su
 * `entityType`, devolviendo solo los que se solapan con `window` (RN-RES-07,
 * cálculo de solapamiento centralizado en `./overlap.ts`) — las reservas,
 * además, solo si su estado cuenta como activo (`./reservation-status.ts`).
 *
 * Deliberadamente sin condición de rango en `GSI3SK` (que sí sería posible
 * para acotar por `startsAt`, consulta 19): un `MaintenanceBlock` puede tener
 * una duración arbitraria fijada por el administrador (no alineada a
 * `blockMinutes` de ningún recurso, a diferencia de una `Reservation`), así
 * que un bloqueo que empezó mucho antes de `window.from` igual puede seguir
 * vigente y solapar la ventana consultada; acotar la consulta por
 * `GSI3SK >= SLOT#<window.from>` lo dejaría fuera por error. Filtrar la
 * partición completa del recurso en memoria es la única forma correcta sin
 * mantener un índice de cobertura aparte — el volumen por recurso es acotado
 * en la práctica (una decena de recursos fijos, catálogo mock, ADR-0010) y
 * esto sigue siendo una `Query` sobre un índice, no un `Scan` de la tabla.
 */
export async function findResourceOccupancy(
  client: DynamoDBDocumentClient,
  resourceId: string,
  window: ResourceOccupancyWindow,
): Promise<ResourceOccupancy> {
  const gsi3Key = keys.reservationsByResource(resourceId);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI3',
      KeyConditionExpression: 'GSI3PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi3Key.GSI3PK },
    }),
  );

  const activeReservations: Reservation[] = [];
  const maintenanceBlocks: MaintenanceBlock[] = [];

  for (const item of result.Items ?? []) {
    const entityType = (item as EntityTyped).entityType;
    if (entityType === 'Reservation') {
      // TODO(Sprint 1): mismo riesgo señalado en otros repositorios — validar
      // la forma del ítem leído contra un esquema propio antes de confiar en
      // el cast.
      const reservation = item as unknown as Reservation;
      if (
        isActiveReservationStatus(reservation.reservationStatus) &&
        intervalsOverlap(reservation.startsAt, reservation.endsAt, window.from, window.to)
      ) {
        activeReservations.push(reservation);
      }
    } else if (entityType === 'MaintenanceBlock') {
      const block = item as unknown as MaintenanceBlock;
      if (intervalsOverlap(block.startsAt, block.endsAt, window.from, window.to)) {
        maintenanceBlocks.push(block);
      }
    }
  }

  return { activeReservations, maintenanceBlocks };
}

interface ReservationItem extends Reservation {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
  GSI3PK: string;
  GSI3SK: string;
  entityType: 'Reservation';
}

interface ReservationParticipantItem extends ReservationParticipant {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  entityType: 'ReservationParticipant';
  subjectKey: string;
  createdAt: string;
}

interface ReservationSlotLockItem {
  PK: string;
  SK: string;
  entityType: 'ReservationSlotLock';
  resourceId: string;
  startsAt: string;
  reservationId: string;
  createdAt: string;
}

function buildReservationItem(reservation: Reservation): ReservationItem {
  return {
    ...reservation,
    ...keys.reservation(reservation.reservationId),
    ...keys.reservationsByHolder(reservation.holderMemberId),
    GSI1SK: `RES#${reservation.startsAt}#${reservation.reservationId}`,
    ...keys.reservationsByStatus(reservation.reservationStatus),
    GSI2SK: `${reservation.startsAt}#${reservation.reservationId}`,
    ...keys.reservationsByResource(reservation.resourceId),
    GSI3SK: `SLOT#${reservation.startsAt}#${reservation.reservationId}`,
    entityType: 'Reservation',
  };
}

/** El titular (`HOLDER`) siempre es un socio: su `subjectKey` es `MEMBER#<memberId>` (nunca `GUEST#`, RN-RES-06). */
function buildHolderParticipantItem(
  participant: ReservationParticipant,
  createdAt: string,
): ReservationParticipantItem {
  const subjectKey = `MEMBER#${participant.memberId}`;
  return {
    ...participant,
    ...keys.reservationParticipant(participant.reservationId, participant.participantId),
    ...keys.participantOverlapBySubject(subjectKey),
    GSI1SK: `PART#${participant.startsAt}#${participant.reservationId}`,
    entityType: 'ReservationParticipant',
    subjectKey,
    createdAt,
  };
}

function buildSlotLockItem(reservation: Reservation): ReservationSlotLockItem {
  return {
    ...keys.reservationSlotLock(reservation.resourceId, reservation.startsAt),
    entityType: 'ReservationSlotLock',
    resourceId: reservation.resourceId,
    startsAt: reservation.startsAt,
    reservationId: reservation.reservationId,
    createdAt: reservation.createdAt,
  };
}

export interface NewReservationItems {
  /** Cabecera de la reserva ya resuelta por el orquestador (`../reservations/create.ts`); sin PK/SK/GSI. */
  reservation: Reservation;
  /** Participante `HOLDER` (el titular, `../reservations/create.ts`); sin PK/SK/GSI. */
  holderParticipant: ReservationParticipant;
}

export type WriteReservationOutcome = 'CREATED' | 'SLOT_TAKEN';

interface CancellationReasonLike {
  Code?: string;
}

interface TransactionCanceledExceptionLike extends Error {
  CancellationReasons?: CancellationReasonLike[];
}

/** Indica si la `TransactWriteItems` falló por la condición del ítem en `index` (mismo patrón que `../registration/repository.ts`). */
function conditionFailedAt(error: unknown, index: number): boolean {
  if (!(error instanceof Error) || error.name !== 'TransactionCanceledException') return false;
  const reasons = (error as TransactionCanceledExceptionLike).CancellationReasons;
  return reasons?.[index]?.Code === 'ConditionalCheckFailed';
}

/**
 * Escribe la reserva completa (cabecera + participante `HOLDER`) en una
 * única `TransactWriteItems`, atómica (criterio 13: si algo falla, no queda
 * ni cabecera sin participante ni participante sin cabecera).
 *
 * El primer ítem de la transacción es el candado de franja
 * (`ReservationSlotLock`, §3.16 de modelo-dynamodb.md): **es la pieza que
 * garantiza el criterio 14** ("dos peticiones concurrentes por la misma
 * franja del mismo recurso terminan con una sola reserva creada"). La
 * lectura previa de `findResourceOccupancy` (hecha por el orquestador antes
 * de llamar aquí) no alcanza por sí sola porque tiene una ventana de carrera
 * clásica lectura-luego-escritura: dos peticiones concurrentes pueden leer
 * "franja libre" antes de que cualquiera de las dos escriba, y
 * `TransactWriteItems` no soporta condicionar el `Put` de un ítem según un
 * rango de *otros* ítems (solo condiciones sobre el propio ítem que se
 * escribe o lee). La solución es un ítem cuya clave es **la misma** para dos
 * intentos concurrentes de la misma franja exacta
 * (`PK=RESOURCE#<resourceId>`, `SK=SLOTLOCK#<startsAt>`) con
 * `ConditionExpression: attribute_not_exists(PK)`: DynamoDB garantiza que, de
 * dos `TransactWriteItems` concurrentes que compiten por esa misma clave,
 * como mucho una tiene éxito. Por qué la igualdad exacta de `startsAt`
 * alcanza para detectar *cualquier* cruce entre dos reservas del mismo
 * recurso (y no hace falta un candado por rango): `startsAt` siempre está
 * alineado a una franja de `blockMinutes` del recurso (validado antes de
 * llegar aquí, `../reservations/slots.ts`), y esas franjas son una partición
 * de intervalos semiabiertos que nunca se solapan entre sí — luego dos
 * reservas del mismo recurso solo pueden solaparse si comparten exactamente
 * el mismo `startsAt`.
 *
 * Devuelve `'SLOT_TAKEN'` (nunca lanza) cuando falla específicamente la
 * condición del candado (índice 0); cualquier otro error se propaga.
 */
export async function writeReservation(
  client: DynamoDBDocumentClient,
  items: NewReservationItems,
): Promise<WriteReservationOutcome> {
  const table = tableName();
  const lockItem = buildSlotLockItem(items.reservation);
  const reservationItem = buildReservationItem(items.reservation);
  const participantItem = buildHolderParticipantItem(
    items.holderParticipant,
    items.reservation.createdAt,
  );

  try {
    await client.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: lockItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            // Defensivo (`reservationId` es un ULID nuevo por solicitud, no
            // debería colisionar nunca): mismo patrón que
            // `../registration/repository.ts`.
            Put: {
              TableName: table,
              Item: reservationItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: table,
              Item: participantItem,
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
    return 'CREATED';
  } catch (error) {
    if (conditionFailedAt(error, 0)) return 'SLOT_TAKEN';
    throw error;
  }
}
