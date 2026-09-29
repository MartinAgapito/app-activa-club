// Acceso a datos de `Reservation`/`ReservationParticipant`/`GuestProfile`/
// `GuestMonthlyCounter` (US-030/US-031, docs/data/modelo-dynamodb.md
// §3.8/3.9/3.10/3.15/3.16, consultas 13/19).
//
// Responsabilidades:
// - `findResourceOccupancy`: lectura (best-effort, no atómica) de las
//   reservas activas y bloqueos de mantenimiento de un recurso que se
//   solapan con una ventana de tiempo dada. Sirve tanto para decidir el
//   rechazo "en frío" antes de escribir (RN-RES-07/09/11) como, más
//   adelante, para US-029 (disponibilidad de un recurso por día): por eso
//   `window` es un parámetro genérico `{ from, to }`, no algo atado a la
//   duración de una reserva puntual.
// - `hasActiveSubjectOverlap` (US-031): mismo cálculo pero por **sujeto**
//   (socio o invitado, GSI1 `SUBJECT#`, RN-RES-08) en vez de por recurso.
// - `getGuestProfile` / `getGuestMonthlyCounter` (US-031): lecturas puntuales
//   por clave, usadas por el orquestador para decidir el nombre a persistir
//   de cada invitado (gana el primer registro, ADR-0009) y para rechazar en
//   frío el cupo mensual ya agotado (RN-RES-05) antes de escribir nada.
// - `writeReservation`: escritura atómica de la reserva completa
//   (`Reservation` + participantes `HOLDER`/`MEMBER`/`GUEST` + upserts de
//   `GuestProfile` + incrementos de `GuestMonthlyCounter`) en una única
//   `TransactWriteItems`, más un ítem interno de candado de concurrencia
//   (`ReservationSlotLock`, §3.16) que es la pieza que de verdad cierra la
//   ventana de carrera del criterio 14 de US-030 (ver su documentación
//   detallada más abajo, junto a `writeReservation`).

import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type {
  GuestProfile,
  MaintenanceBlock,
  Reservation,
  ReservationParticipant,
} from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import { guestMonthlyCounterMonth } from './guest-month';
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

/**
 * RN-RES-08 (criterios 2/3/4 de US-031): `true` si `subjectKey` (`MEMBER#<id>`
 * o `GUEST#<dni>`) ya participa (como `HOLDER`, `MEMBER` o `GUEST`) de otra
 * reserva **activa** cuya ventana se solapa con `window`, sin importar el
 * recurso.
 *
 * Dos pasos: (1) `Query` GSI1 `PK=SUBJECT#<subjectKey>` (patrón 13) —
 * proyección completa, incluye `startsAt`/`endsAt` copiados de la reserva en
 * cada `ReservationParticipant`, así que el filtro de solapamiento no
 * necesita una segunda lectura; (2) para los candidatos que sí se solapan en
 * el tiempo, `GetItem` de cada `Reservation` madre distinta (deduplicada) para
 * conocer su `reservationStatus` real y descartar `CANCELLED`/`REJECTED` —
 * `ReservationParticipant` (§3.9) no guarda el estado de la reserva
 * (deliberado: evita una copia que se desincroniza cada vez que US-033/034
 * cambian el estado de la cabecera sin tocar sus participantes).
 */
export async function hasActiveSubjectOverlap(
  client: DynamoDBDocumentClient,
  subjectKey: string,
  window: ResourceOccupancyWindow,
): Promise<boolean> {
  const gsi1Key = keys.participantOverlapBySubject(subjectKey);
  const result = await client.send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': gsi1Key.GSI1PK },
    }),
  );

  const candidates = (result.Items ?? []).filter((item) => {
    const participant = item as unknown as ReservationParticipant;
    return intervalsOverlap(participant.startsAt, participant.endsAt, window.from, window.to);
  });
  if (candidates.length === 0) return false;

  const reservationIds = [
    ...new Set(candidates.map((item) => (item as unknown as ReservationParticipant).reservationId)),
  ];
  const reservations = await Promise.all(
    reservationIds.map((reservationId) =>
      client.send(new GetCommand({ TableName: tableName(), Key: keys.reservation(reservationId) })),
    ),
  );

  return reservations.some((response) => {
    const reservation = response.Item as unknown as Reservation | undefined;
    return reservation !== undefined && isActiveReservationStatus(reservation.reservationStatus);
  });
}

/**
 * Lee el `GuestProfile` de un invitado externo si ya existe (§3.15). Usado
 * por el orquestador para resolver, antes de escribir, el nombre que debe
 * quedar en el `ReservationParticipant` (gana el primer registro, ADR-0009)
 * — el propio `Update` idempotente dentro de la transacción (ver
 * `writeReservation`) no permite leer ese valor resuelto dentro de la misma
 * operación.
 */
export async function getGuestProfile(
  client: DynamoDBDocumentClient,
  guestDni: string,
): Promise<GuestProfile | undefined> {
  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.guestProfile(guestDni) }),
  );
  return result.Item ? (result.Item as unknown as GuestProfile) : undefined;
}

/** Ítem `GuestMonthlyCounter` tal como se lee de DynamoDB (§3.10, nunca expuesto por la API). */
export interface GuestMonthlyCounterRecord {
  guestDni: string;
  month: string;
  visitCount: number;
  reservationIds: string[];
  updatedAt: string;
}

/**
 * Lee el contador mensual vigente de un invitado externo (§3.10), si existe.
 * Usado para el rechazo "en frío" (RN-RES-05, criterio 5 de US-031): el
 * `Update` condicional dentro de `writeReservation` es la garantía real
 * contra la carrera de concurrencia (criterio 6), pero rechazar antes de
 * intentar escribir evita abrir una transacción condenada a fallar en el
 * caso común (invitado que ya agotó su cupo, sin ninguna carrera de por
 * medio).
 */
export async function getGuestMonthlyCounter(
  client: DynamoDBDocumentClient,
  guestDni: string,
  month: string,
): Promise<GuestMonthlyCounterRecord | undefined> {
  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.guestMonthlyCounter(guestDni, month) }),
  );
  return result.Item ? (result.Item as unknown as GuestMonthlyCounterRecord) : undefined;
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

/**
 * `subjectKey` de un participante según su tipo (RN-RES-06/08): el titular
 * (`HOLDER`) y un socio acompañante (`MEMBER`) son siempre `MEMBER#<memberId>`;
 * un invitado externo (`GUEST`) es `GUEST#<guestDni>`. Única función para las
 * tres variantes: mismo criterio de superposición para los tres tipos.
 */
function buildParticipantItem(
  participant: ReservationParticipant,
  createdAt: string,
): ReservationParticipantItem {
  const subjectKey =
    participant.participantType === 'GUEST'
      ? `GUEST#${participant.guestDni}`
      : `MEMBER#${participant.memberId}`;
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

/** Datos mínimos para el upsert idempotente de un `GuestProfile` dentro de la transacción (US-031, §3.15). */
export interface GuestProfileUpsertInput {
  guestDni: string;
  /** Nombre enviado en esta solicitud: solo se persiste si el perfil no existía todavía (gana el primer registro). */
  firstName: string;
  lastName: string;
  /** Socio titular que registra al invitado (solo se persiste si el perfil es nuevo). */
  createdByMemberId: string;
}

/**
 * `Update` idempotente de `GuestProfile` (§3.15): `SET <campo> =
 * if_not_exists(<campo>, :valor)` en cada atributo de contenido. **Nunca
 * falla por condición** (no lleva `ConditionExpression`): si el perfil ya
 * existía, cada `if_not_exists` conserva el valor guardado y el enviado se
 * descarta sin error (gana el primer registro, ADR-0009); si no existía, lo
 * crea con los valores enviados. Por eso este `Update` jamás puede ser la
 * causa de que la transacción entera se cancele — a diferencia del `Update`
 * de `GuestMonthlyCounter`, que sí lleva condición (ver
 * `buildGuestMonthlyCounterTransactItem`).
 */
function buildGuestProfileUpsertTransactItem(
  table: string,
  upsert: GuestProfileUpsertInput,
  now: string,
): NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>[number] {
  return {
    Update: {
      TableName: table,
      Key: keys.guestProfile(upsert.guestDni),
      UpdateExpression:
        'SET guestDni = if_not_exists(guestDni, :guestDni), ' +
        'firstName = if_not_exists(firstName, :firstName), ' +
        'lastName = if_not_exists(lastName, :lastName), ' +
        'createdByMemberId = if_not_exists(createdByMemberId, :createdByMemberId), ' +
        'createdAt = if_not_exists(createdAt, :now), ' +
        'updatedAt = :now',
      ExpressionAttributeValues: {
        ':guestDni': upsert.guestDni,
        ':firstName': upsert.firstName,
        ':lastName': upsert.lastName,
        ':createdByMemberId': upsert.createdByMemberId,
        ':now': now,
      },
    },
  };
}

/**
 * `Update` condicional de `GuestMonthlyCounter` (§3.10, RN-RES-05): incrementa
 * `visitCount` y agrega `reservationId` a `reservationIds`, condicionado a
 * `attribute_not_exists(visitCount) OR visitCount < 2` — cubre a la vez la
 * primera visita del mes (el ítem todavía no existe) y la segunda (existe con
 * `visitCount=1`). Si la condición falla (ya tiene 2 visitas, o una
 * transacción concurrente ganó la carrera primero, criterio 6 de US-031), la
 * `TransactWriteItems` completa se cancela y `writeReservation` lo traduce a
 * `'GUEST_LIMIT_EXCEEDED'`.
 *
 * `month` usa `ExpressionAttributeNames` (`#month`) porque `MONTH` es palabra
 * reservada de DynamoDB (PartiQL).
 */
function buildGuestMonthlyCounterTransactItem(
  table: string,
  guestDni: string,
  month: string,
  reservationId: string,
  now: string,
): NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>[number] {
  return {
    Update: {
      TableName: table,
      Key: keys.guestMonthlyCounter(guestDni, month),
      UpdateExpression:
        'SET visitCount = if_not_exists(visitCount, :zero) + :one, ' +
        'guestDni = if_not_exists(guestDni, :guestDni), ' +
        '#month = if_not_exists(#month, :month), ' +
        'reservationIds = list_append(if_not_exists(reservationIds, :emptyList), :newReservationIds), ' +
        'updatedAt = :now',
      ConditionExpression: 'attribute_not_exists(visitCount) OR visitCount < :max',
      ExpressionAttributeNames: { '#month': 'month' },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
        ':guestDni': guestDni,
        ':month': month,
        ':emptyList': [],
        ':newReservationIds': [reservationId],
        ':now': now,
        ':max': 2,
      },
    },
  };
}

export interface NewReservationItems {
  /** Cabecera de la reserva ya resuelta por el orquestador (`../reservations/create.ts`); sin PK/SK/GSI. */
  reservation: Reservation;
  /** Participante `HOLDER` (el titular, `../reservations/create.ts`); sin PK/SK/GSI. */
  holderParticipant: ReservationParticipant;
  /** Participantes adicionales (`MEMBER`/`GUEST`, US-031), sin incluir al `HOLDER`; sin PK/SK/GSI. */
  additionalParticipants?: ReservationParticipant[];
  /** Un upsert por cada invitado externo distinto entre `additionalParticipants` (US-031, §3.15). */
  guestProfileUpserts?: GuestProfileUpsertInput[];
}

export type WriteReservationOutcome = 'CREATED' | 'SLOT_TAKEN' | 'GUEST_LIMIT_EXCEEDED';

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
 * Escribe la reserva completa (cabecera + participantes `HOLDER`/`MEMBER`/
 * `GUEST` + upserts de `GuestProfile` + incrementos de `GuestMonthlyCounter`)
 * en una única `TransactWriteItems`, atómica (criterio 11 de US-031, criterio
 * 13 de US-030: si algo falla, no queda ningún efecto parcial — ni cabecera
 * sin participantes, ni un perfil de invitado creado de una reserva
 * rechazada, ni un contador incrementado de más).
 *
 * Orden de ítems en la transacción (los índices exactos de los contadores de
 * invitado se calculan en tiempo de ejecución, según cuántos participantes y
 * perfiles haya, y se usan para traducir el resultado — ver más abajo):
 * 1. Candado de franja (`ReservationSlotLock`, §3.16) — ver comentario
 *    detallado de la sección anterior (US-030, criterio 14 de esa historia):
 *    es la pieza que cierra la ventana de carrera de dos peticiones
 *    concurrentes por la misma franja exacta del mismo recurso.
 * 2. `Put` de la cabecera `Reservation` (defensivo).
 * 3. `Put` del participante `HOLDER` (defensivo).
 * 4..N. `Put` de cada participante adicional `MEMBER`/`GUEST` (defensivo).
 * N+1..M. `Update` idempotente de cada `GuestProfile` distinto (nunca falla).
 * M+1..Fin. `Update` condicional de cada `GuestMonthlyCounter` distinto
 *    (única fuente real de fallo de negocio de este bloque, RN-RES-05).
 *
 * Límite de `TransactWriteItems` (100 ítems): en el peor caso (30
 * participantes, todos invitados nuevos) la transacción escribe 1 candado + 1
 * cabecera + 31 participantes (holder + 30) + 30 perfiles + 30 contadores =
 * 93 ítems, por debajo del límite (`participants` está acotado a 30 en el
 * esquema Zod exactamente por esta cuenta, docs/data/modelo-dynamodb.md
 * §3.15).
 *
 * Devuelve `'SLOT_TAKEN'` si falla específicamente la condición del candado
 * (índice 0, criterio 14 de US-030) o `'GUEST_LIMIT_EXCEEDED'` si falla la
 * condición de cualquier `GuestMonthlyCounter` (criterio 6 de US-031, cierre
 * de la carrera de concurrencia real: dos transacciones que compiten por la
 * segunda/tercera visita del mismo invitado en el mismo mes — como mucho una
 * gana, porque `TransactWriteItems` serializa las escrituras que comparten
 * clave). Cualquier otro error se propaga.
 */
export async function writeReservation(
  client: DynamoDBDocumentClient,
  items: NewReservationItems,
): Promise<WriteReservationOutcome> {
  const table = tableName();
  const now = items.reservation.createdAt;
  const additionalParticipants = items.additionalParticipants ?? [];
  const guestProfileUpserts = items.guestProfileUpserts ?? [];

  const lockItem = buildSlotLockItem(items.reservation);
  const reservationItem = buildReservationItem(items.reservation);
  const holderItem = buildParticipantItem(items.holderParticipant, now);
  const additionalItems = additionalParticipants.map((participant) =>
    buildParticipantItem(participant, now),
  );

  const transactItems: NonNullable<
    ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']
  > = [
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
        Item: holderItem,
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    ...additionalItems.map((item) => ({
      Put: {
        TableName: table,
        Item: item,
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    })),
  ];

  for (const upsert of guestProfileUpserts) {
    transactItems.push(buildGuestProfileUpsertTransactItem(table, upsert, now));
  }

  // Un `GuestMonthlyCounter` por cada invitado externo distinto entre los
  // participantes adicionales (deduplicado por `guestDni`, aunque en la
  // práctica ya viene deduplicado por `assertNoDuplicateParticipants` en
  // `../reservations/create.ts`).
  const guestDnis = [
    ...new Set(
      additionalParticipants
        .filter((participant) => participant.participantType === 'GUEST' && participant.guestDni)
        .map((participant) => participant.guestDni as string),
    ),
  ];
  const month = guestDnis.length > 0 ? guestMonthlyCounterMonth(items.reservation.startsAt) : '';
  const guestCounterStartIndex = transactItems.length;
  for (const guestDni of guestDnis) {
    transactItems.push(
      buildGuestMonthlyCounterTransactItem(
        table,
        guestDni,
        month,
        items.reservation.reservationId,
        now,
      ),
    );
  }
  const guestCounterEndIndex = transactItems.length;

  try {
    await client.send(new TransactWriteCommand({ TransactItems: transactItems }));
    return 'CREATED';
  } catch (error) {
    if (conditionFailedAt(error, 0)) return 'SLOT_TAKEN';
    for (let index = guestCounterStartIndex; index < guestCounterEndIndex; index += 1) {
      if (conditionFailedAt(error, index)) return 'GUEST_LIMIT_EXCEEDED';
    }
    throw error;
  }
}
