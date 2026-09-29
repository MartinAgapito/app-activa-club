// Orquestador de `POST /reservations` (US-030/US-031, docs/api/contratos-api.md
// §7, RN-RES-01/02/03/04/05/06/07/08/09/11/12, RN-PAG-06): resuelve el socio
// autenticado y valida su elegibilidad (activo, sin deuda), resuelve el
// recurso, calcula `endsAt` en el servidor, valida horario/alineación de
// franja, valida mantenimiento (del recurso completo y de la franja
// puntual), valida cruces con otras reservas activas del recurso, resuelve
// cada participante adicional (`participants[]`: socios por `memberId`,
// invitados externos por DNI), valida superposición por sujeto y cupo
// mensual de invitado, valida aforo, decide el estado inicial
// (`CONFIRMED`/`PENDING_APPROVAL`) y escribe todo de forma atómica
// (`./repository.ts`). Deja auditoría (`AuditLog`) como rastro para disparar
// más adelante el evento de notificación `RESERVATION_CONFIRMED` (criterio
// 16 de US-030; el envío en sí es EP-05, fuera de alcance).

import { ulid } from 'ulid';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CreateReservationRequest,
  CreateReservationResponse,
  Member,
  Reservation,
  ReservationParticipant,
  ReservationParticipantInput,
} from '@activa-club/shared-types';

import { recordAuditLog } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub, getMemberById } from '../members/repository';
import { getResourceById } from '../resources/repository';
import { guestMonthlyCounterMonth } from './guest-month';
import { resolveReservationEndsAt } from './reservation-window';
import type { GuestProfileUpsertInput } from './repository';
import {
  findResourceOccupancy,
  getGuestMonthlyCounter,
  getGuestProfile,
  hasActiveSubjectOverlap,
  writeReservation,
} from './repository';
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
 * RN-RES-12/RN-PAG-06 (criterios 10/11 de US-030; cierra A-11, A-15, P-10):
 * solo un socio `ACTIVE`, sin deuda (`membershipStatus` fuera de
 * `DEBT`/`EXPIRED`) y sin saldo pendiente, puede confirmar una reserva. A
 * diferencia de `payments/eligibility.ts` (que acepta `APPROVED` para el
 * primer pago), aquí el único `memberStatus` habilitado es `ACTIVE`: un socio
 * `APPROVED` sin pagar su primera membresía todavía no puede reservar
 * (RN-ACT-07). Esta exigencia recae solo en el **titular** (RN-RES-06); un
 * socio participante (US-031) no se valida por este camino (caso alternativo
 * documentado en la historia).
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
 * RN-RES-03 (criterio 9 de US-031): un participante repetido dentro de la
 * misma solicitud (mismo `memberId`, o mismo `dni` de invitado, dos veces) se
 * rechaza antes de tocar DynamoDB — comparación en memoria, sin ninguna
 * lectura previa.
 */
export function assertNoDuplicateParticipants(participants: ReservationParticipantInput[]): void {
  const seenMemberIds = new Set<string>();
  const seenGuestDnis = new Set<string>();

  for (const participant of participants) {
    if (participant.type === 'MEMBER' && participant.memberId) {
      if (seenMemberIds.has(participant.memberId)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Un socio participante está repetido en la solicitud.',
        );
      }
      seenMemberIds.add(participant.memberId);
    }
    if (participant.type === 'GUEST' && participant.dni) {
      if (seenGuestDnis.has(participant.dni)) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Un invitado externo está repetido en la solicitud.',
        );
      }
      seenGuestDnis.add(participant.dni);
    }
  }
}

interface ResolvedMemberParticipant {
  participantType: 'MEMBER';
  memberId: string;
}

interface ResolvedGuestParticipant {
  participantType: 'GUEST';
  guestDni: string;
  /** Nombre resuelto: el del `GuestProfile` existente si ya había uno (gana el primer registro), o el enviado si es nuevo. */
  firstName: string;
  lastName: string;
}

type ResolvedParticipant = ResolvedMemberParticipant | ResolvedGuestParticipant;

function isResolvedGuest(
  participant: ResolvedParticipant,
): participant is ResolvedGuestParticipant {
  return participant.participantType === 'GUEST';
}

function subjectKeyOf(participant: ResolvedParticipant): string {
  return participant.participantType === 'MEMBER'
    ? `MEMBER#${participant.memberId}`
    : `GUEST#${participant.guestDni}`;
}

/**
 * Resuelve cada entrada de `participants[]` (RN-RES-03/04, US-031, "Reglas de
 * resolución"):
 * - `MEMBER`: `GetItem` por `memberId` (patrón de acceso #1) — 404
 *   `NOT_FOUND` si no corresponde a ningún socio (criterio 10). No valida su
 *   `memberStatus`: esa exigencia (RN-RES-12) recae solo en el titular.
 * - `GUEST`: `GetItem` de su `GuestProfile` si ya existe (§3.15), para
 *   resolver el nombre que prevalece (gana el primer registro, ADR-0009). No
 *   se escribe nada todavía: el upsert ocurre recién dentro de la transacción
 *   final (`./repository.ts`, `writeReservation`).
 *
 * Todas las resoluciones se hacen en paralelo (`Promise.all`): son lecturas
 * independientes entre sí.
 */
async function resolveParticipants(
  client: DynamoDBDocumentClient,
  participants: ReservationParticipantInput[],
): Promise<ResolvedParticipant[]> {
  return Promise.all(
    participants.map(async (participant): Promise<ResolvedParticipant> => {
      if (participant.type === 'MEMBER') {
        const memberId = participant.memberId as string; // garantizado por reservationParticipantInputSchema
        const resolvedMember = await getMemberById(client, memberId);
        if (!resolvedMember) {
          throw new AppError(
            'NOT_FOUND',
            'Uno de los socios participantes no corresponde a ningún socio del club.',
          );
        }
        return { participantType: 'MEMBER', memberId };
      }

      const guestDni = participant.dni as string; // garantizado por reservationParticipantInputSchema
      const existingProfile = await getGuestProfile(client, guestDni);
      return {
        participantType: 'GUEST',
        guestDni,
        firstName: existingProfile?.firstName ?? (participant.firstName as string),
        lastName: existingProfile?.lastName ?? (participant.lastName as string),
      };
    }),
  );
}

/**
 * Procesa `POST /reservations` de punta a punta (criterios 1-18 de US-030 y
 * US-031). Ver cabecera del módulo para el resumen del flujo.
 */
export async function createReservation(
  input: CreateReservationInput,
): Promise<CreateReservationResponse> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  // Criterio 9 (US-031): en memoria, antes de cualquier lectura o escritura.
  assertNoDuplicateParticipants(input.request.participants);

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

  // US-031 (a): resuelve cada participante adicional (MEMBER por memberId,
  // GUEST por DNI + su GuestProfile existente, si lo hay).
  const resolvedParticipants = await resolveParticipants(client, input.request.participants);

  // US-031 (b), RN-RES-08 (criterios 2/3/4): sin superposición de ningún
  // sujeto (titular incluido) con otra reserva activa suya, sin importar el
  // recurso.
  const window = { from: startsAt, to: endsAt };
  const subjectKeysToCheck = [
    `MEMBER#${member.memberId}`,
    ...resolvedParticipants.map(subjectKeyOf),
  ];
  const overlapResults = await Promise.all(
    subjectKeysToCheck.map((subjectKey) => hasActiveSubjectOverlap(client, subjectKey, window)),
  );
  if (overlapResults.some(Boolean)) {
    throw new AppError(
      'PARTICIPANT_OVERLAP',
      'Uno de los participantes ya tiene una reserva activa en un horario que se superpone.',
    );
  }

  // US-031 (c), RN-RES-05 (criterio 5): rechazo "en frío" del cupo mensual ya
  // agotado, antes de intentar escribir nada. La garantía real contra la
  // carrera de concurrencia (criterio 6) es el `Update` condicional dentro de
  // la transacción (`./repository.ts`).
  const guestParticipants = resolvedParticipants.filter(isResolvedGuest);
  const month = guestMonthlyCounterMonth(startsAt);
  if (guestParticipants.length > 0) {
    const counters = await Promise.all(
      guestParticipants.map((guest) => getGuestMonthlyCounter(client, guest.guestDni, month)),
    );
    const anyGuestAtLimit = counters.some((counter) => (counter?.visitCount ?? 0) >= 2);
    if (anyGuestAtLimit) {
      throw new AppError(
        'GUEST_MONTHLY_LIMIT',
        'Un invitado externo ya alcanzó su límite de dos visitas este mes.',
      );
    }
  }

  // US-031 (d), RN-RES-09 (criterio 8): aforo real, titular + todos los
  // participantes (socios e invitados). `guestCount` cuenta solo los `GUEST`.
  const participantCount = 1 + resolvedParticipants.length;
  const guestCount = guestParticipants.length;
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

  // US-031 (e): un `ReservationParticipant` adicional por cada socio o
  // invitado resuelto, más un upsert de `GuestProfile` por cada invitado
  // distinto (el `guestName` que queda en cada participante es copia del
  // perfil resuelto, no del texto enviado — criterio 17).
  const additionalParticipants: ReservationParticipant[] = resolvedParticipants.map(
    (participant) =>
      participant.participantType === 'MEMBER'
        ? {
            participantId: ulid(),
            reservationId,
            participantType: 'MEMBER',
            memberId: participant.memberId,
            guestDni: null,
            guestName: null,
            startsAt,
            endsAt,
          }
        : {
            participantId: ulid(),
            reservationId,
            participantType: 'GUEST',
            memberId: null,
            guestDni: participant.guestDni,
            guestName: `${participant.firstName} ${participant.lastName}`,
            startsAt,
            endsAt,
          },
  );

  const guestProfileUpserts: GuestProfileUpsertInput[] = guestParticipants.map((guest) => ({
    guestDni: guest.guestDni,
    firstName: guest.firstName,
    lastName: guest.lastName,
    createdByMemberId: member.memberId,
  }));

  const outcome = await writeReservation(client, {
    reservation,
    holderParticipant,
    additionalParticipants,
    guestProfileUpserts,
  });
  if (outcome === 'SLOT_TAKEN') {
    // Cierra la ventana de carrera de dos peticiones concurrentes por la
    // misma franja exacta (criterio 14 de US-030): ver el candado
    // `ReservationSlotLock` documentado en `./repository.ts` (`writeReservation`).
    throw new AppError(
      'RESERVATION_OVERLAP',
      'La franja solicitada se cruza con otra reserva activa del recurso.',
    );
  }
  if (outcome === 'GUEST_LIMIT_EXCEEDED') {
    // Cierra la ventana de carrera de dos reservas concurrentes con el mismo
    // invitado en su segunda/tercera visita del mes (criterio 6 de US-031):
    // ver el `Update` condicional documentado en `./repository.ts`
    // (`buildGuestMonthlyCounterTransactItem`).
    throw new AppError(
      'GUEST_MONTHLY_LIMIT',
      'Un invitado externo ya alcanzó su límite de dos visitas este mes.',
    );
  }

  // Rastro de auditoría (criterio 16 de US-030): no envía la notificación
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
