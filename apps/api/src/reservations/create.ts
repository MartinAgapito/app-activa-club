// Orquestador de `POST /reservations` (US-030, docs/api/contratos-api.md §7,
// RN-RES-01/02/06/07/09/11/12, RN-PAG-06): resuelve el socio autenticado y
// valida su elegibilidad (activo, sin deuda), resuelve el recurso, calcula
// `endsAt` en el servidor, valida horario/alineación de franja, valida
// mantenimiento (del recurso completo y de la franja puntual), valida
// cruces con otras reservas activas, valida aforo, decide el estado inicial
// (`CONFIRMED`/`PENDING_APPROVAL`) y escribe todo de forma atómica
// (`./repository.ts`). Deja auditoría (`AuditLog`) como rastro para disparar
// más adelante el evento de notificación `RESERVATION_CONFIRMED` (criterio
// 16; el envío en sí es EP-05, fuera de alcance).
//
// Alcance explícito fuera de esta historia (US-031, "Reglas de resolución"
// de US-030): la reserva solo registra al titular (`HOLDER`). El contenido
// de `request.participants` (socios adicionales e invitados externos,
// resolución por DNI, `GuestProfile`, contador mensual) se ignora
// deliberadamente aquí — `participantCount` es siempre 1 y `guestCount`
// siempre 0. Cuando se implemente US-031, este archivo es el punto de
// extensión: hay que (a) resolver cada entrada de `participants` a un
// `ReservationParticipant` adicional (MEMBER/GUEST), (b) validar
// superposición por sujeto (RN-RES-08, GSI1 `SUBJECT#`), (c) validar el
// límite mensual de invitado (RN-RES-05, `GuestMonthlyCounter`), (d) sumar
// esos participantes al aforo (`participantCount`/`guestCount` reales) antes
// del chequeo de `CAPACITY_EXCEEDED` de más abajo, y (e) extender
// `./repository.ts` (`writeReservation`) para incluir esos ítems adicionales
// en la misma `TransactWriteItems`.

import { ulid } from 'ulid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CreateReservationRequest,
  CreateReservationResponse,
  Member,
  Reservation,
  ReservationParticipant,
} from '@activa-club/shared-types';

import { recordAuditLog } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import { getResourceById } from '../resources/repository';
import { resolveReservationEndsAt } from './reservation-window';
import { findResourceOccupancy, writeReservation } from './repository';
import { limaCalendarDate, limaWallTimeToUtc } from './time';

export interface CreateReservationInput {
  /** `cognitoSub` de la identidad autenticada (el titular siempre es el socio autenticado, RN-RES-06). */
  cognitoSub: string;
  request: CreateReservationRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
  /** `reservationId` inyectable, para pruebas deterministas. */
  reservationId?: string;
  /** `participantId` del `HOLDER` inyectable, para pruebas deterministas. */
  holderParticipantId?: string;
}

const NON_RESERVABLE_MEMBERSHIP_STATUSES: ReadonlySet<Member['membershipStatus']> = new Set([
  'DEBT',
  'EXPIRED',
]);

/**
 * RN-RES-12/RN-PAG-06 (criterios 10/11; cierra A-11, A-15, P-10): solo un
 * socio `ACTIVE`, sin deuda (`membershipStatus` fuera de `DEBT`/`EXPIRED`) y
 * sin saldo pendiente, puede confirmar una reserva. A diferencia de
 * `payments/eligibility.ts` (que acepta `APPROVED` para el primer pago), aquí
 * el único `memberStatus` habilitado es `ACTIVE`: un socio `APPROVED` sin
 * pagar su primera membresía todavía no puede reservar (RN-ACT-07).
 */
export function assertMemberCanReserve(member: Member): void {
  if (member.memberStatus !== 'ACTIVE') {
    throw new AppError('MEMBERSHIP_REQUIRED', 'El socio debe estar activo para reservar.');
  }
  if (
    NON_RESERVABLE_MEMBERSHIP_STATUSES.has(member.membershipStatus) ||
    member.outstandingBalance > 0
  ) {
    throw new AppError(
      'MEMBER_HAS_DEBT',
      'El socio tiene deuda o una membresía vencida; debe regularizarla antes de reservar.',
    );
  }
}

export interface ScheduleWindowInput {
  /** `startsAt` ya normalizado (`.toISOString()`). */
  startsAt: string;
  /** `endsAt` ya calculado por `resolveReservationEndsAt` (nunca del cliente). */
  endsAt: string;
  /** Horario operativo del recurso, hora local del club, formato `HH:mm`. */
  opensAt: string;
  closesAt: string;
  blockMinutes: number;
  /** Instante de referencia ("ahora"), inyectable para pruebas deterministas. */
  now: Date;
}

/**
 * RN-RES-01 (horarios mock por recurso), criterios 5/6 y los casos
 * alternativos "franja fuera de horario", "franja que cruza el cierre del
 * recurso" y "reserva en el pasado o para el mismo instante" (US-030).
 *
 * Construida directamente sobre `./time.ts` (`limaWallTimeToUtc`), no sobre
 * `./slots.ts` de US-029: `isSlotPast` de ese módulo trata a propósito el
 * borde "`startsAt` == ahora" como **no pasado** (pensada para *mostrar* el
 * estado de una franja de disponibilidad, donde el contrato no fija ese
 * borde), mientras que esta historia sí lo define explícitamente como
 * inválido ("para el mismo instante" también se rechaza). Reusar `isSlotPast`
 * tal cual dejaría pasar por válida una reserva que la historia pide
 * rechazar, así que aquí se implementa el criterio exacto que pide US-030 en
 * vez de forzar una semántica ajena a otro caso de uso.
 *
 * `isAlignedToGrid` reproduce, sin iterar, la misma condición que la
 * generación de franjas de `./slots.ts` (`generateResourceSlots`): un
 * `startsAt` es válido si difiere de `opensAt` en un múltiplo entero de
 * `blockMinutes`, y su bloque completo (`endsAt`) no cruza `closesAt`.
 */
export function isWithinResourceSchedule(input: ScheduleWindowInput): boolean {
  const dateLima = limaCalendarDate(new Date(input.startsAt));
  const opensAtUtcMs = limaWallTimeToUtc(dateLima, input.opensAt).getTime();
  const closesAtUtcMs = limaWallTimeToUtc(dateLima, input.closesAt).getTime();
  const startMs = new Date(input.startsAt).getTime();
  const endMs = new Date(input.endsAt).getTime();
  const blockMs = input.blockMinutes * 60_000;

  const isAlignedToGrid = (startMs - opensAtUtcMs) % blockMs === 0;
  const isWithinOperatingHours = startMs >= opensAtUtcMs && endMs <= closesAtUtcMs;
  const hasNotStartedYet = startMs > input.now.getTime();

  return isAlignedToGrid && isWithinOperatingHours && hasNotStartedYet;
}

/**
 * Procesa `POST /reservations` de punta a punta (criterios 1-16). Ver
 * cabecera del módulo para el resumen del flujo y el alcance excluido
 * (US-031).
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResponse> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const member = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!member) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }
  assertMemberCanReserve(member);

  const resource = await getResourceById(client, input.request.resourceId);
  if (!resource) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso solicitado.');
  }

  // Normalizado una sola vez aquí: el resto del flujo (validación de
  // horario, claves de escritura, respuesta) usa siempre este mismo formato
  // (`.toISOString()`, igual que `resolveReservationEndsAt`), evitando falsos
  // negativos de alineación por variantes de formato válidas del esquema
  // (p. ej. sin milisegundos u offset `+00:00` en vez de `Z`).
  const startsAt = new Date(input.request.startsAt).toISOString();
  const endsAt = resolveReservationEndsAt(startsAt, resource.blockMinutes);

  // Cubre a la vez: horario fuera de opensAt/closesAt (criterio 6), franja
  // que no coincide con el inicio de un bloque válido (criterio 5), franja
  // que cruza el cierre del recurso (caso alternativo) y franja ya iniciada
  // o en el pasado, incluido el mismo instante (caso alternativo) — los
  // cuatro devuelven el mismo código.
  const withinSchedule = isWithinResourceSchedule({
    startsAt,
    endsAt,
    opensAt: resource.opensAt,
    closesAt: resource.closesAt,
    blockMinutes: resource.blockMinutes,
    now,
  });
  if (!withinSchedule) {
    throw new AppError(
      'OUTSIDE_SCHEDULE',
      'La franja solicitada está fuera del horario del recurso, no coincide con un bloque válido, o ya pasó.',
    );
  }

  // RN-RES-11: un recurso completo en mantenimiento rechaza cualquier
  // reserva nueva sin necesidad de consultar cruces puntuales.
  if (resource.resourceStatus === 'MAINTENANCE') {
    throw new AppError(
      'RESOURCE_IN_MAINTENANCE',
      'El recurso está en mantenimiento y no admite reservas nuevas.',
    );
  }

  const occupancy = await findResourceOccupancy(client, resource.resourceId, {
    from: startsAt,
    to: endsAt,
  });
  // Precedencia: un bloqueo de mantenimiento puntual gana aunque la franja
  // también tenga una reserva activa previa (RN-RES-11, criterio 9; las
  // reservas existentes no se cancelan solas al crear un bloqueo, US-035).
  if (occupancy.maintenanceBlocks.length > 0) {
    throw new AppError(
      'RESOURCE_IN_MAINTENANCE',
      'La franja solicitada está bloqueada por mantenimiento.',
    );
  }
  if (occupancy.activeReservations.length > 0) {
    throw new AppError(
      'RESERVATION_OVERLAP',
      'La franja solicitada se cruza con otra reserva activa del recurso.',
    );
  }

  // Alcance de esta historia (US-030, ver cabecera del módulo): la reserva
  // solo tiene al titular. US-031 sumará aquí los participantes adicionales
  // resueltos desde `input.request.participants` antes de este chequeo.
  const participantCount = 1;
  const guestCount = 0;
  if (participantCount > resource.capacity) {
    throw new AppError(
      'CAPACITY_EXCEEDED',
      'El total de participantes supera el aforo del recurso.',
    );
  }

  // RN-RES-01/02: confirmación automática salvo parrilla/salón social.
  const reservationStatus = resource.requiresApproval ? 'PENDING_APPROVAL' : 'CONFIRMED';
  const reservationId = input.reservationId ?? ulid();
  const holderParticipantId = input.holderParticipantId ?? ulid();

  const reservation: Reservation = {
    reservationId,
    resourceId: resource.resourceId,
    resourceType: resource.type,
    holderMemberId: member.memberId,
    startsAt,
    endsAt,
    reservationStatus,
    participantCount,
    guestCount,
    requiresApproval: resource.requiresApproval,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const holderParticipant: ReservationParticipant = {
    participantId: holderParticipantId,
    reservationId,
    participantType: 'HOLDER',
    memberId: member.memberId,
    guestDni: null,
    guestName: null,
    startsAt,
    endsAt,
  };

  const outcome = await writeReservation(client, { reservation, holderParticipant });
  if (outcome === 'SLOT_TAKEN') {
    // Cierra la ventana de carrera de dos peticiones concurrentes por la
    // misma franja exacta (criterio 14): ver el candado `ReservationSlotLock`
    // documentado en `./repository.ts` (`writeReservation`).
    throw new AppError(
      'RESERVATION_OVERLAP',
      'La franja solicitada se cruza con otra reserva activa del recurso.',
    );
  }

  // Rastro de auditoría (criterio 16): no envía la notificación
  // `RESERVATION_CONFIRMED` (EP-05, fuera de alcance), pero deja registrado
  // qué se creó y con qué estado, suficiente para que ese módulo la dispare
  // más adelante sin rediseñar este flujo.
  await recordAuditLog(client, {
    action: 'RESERVATION_CREATED',
    actor: { actorId: member.memberId, actorRole: 'member' },
    targetType: 'Reservation',
    targetId: reservationId,
    metadata: { resourceId: resource.resourceId, reservationStatus, startsAt, endsAt },
    now: nowIso,
  });

  return {
    reservationId,
    resourceId: resource.resourceId,
    reservationStatus,
    startsAt,
    endsAt,
    participantCount,
    guestCount,
  };
}
