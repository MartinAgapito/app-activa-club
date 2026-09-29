// Orquestador de `GET /resources/{resourceId}/availability?date=YYYY-MM-DD`
// (US-029, docs/api/contratos-api.md §6, RN-RES-01/07/11). Composición pura de
// piezas ya construidas en Ola 1 (`./slots.ts`, `./overlap.ts`) y Ola 2
// (`../resources/repository.ts`, `./repository.ts`, US-030): esta historia no
// agrega lógica de dominio nueva, solo orquesta una única consulta a GSI3 por
// día (nunca por franja) y aplica el cálculo de las tres banderas de cada
// franja ya resuelto por `./slots.ts` (`resolveSlotStatus`).
//
// Sin efectos: la disponibilidad es una foto del momento, no una reserva del
// cupo (postcondiciones de la historia) — no escribe nada en DynamoDB.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AvailabilityResponse, AvailabilitySlot } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { getResourceById } from '../resources/repository';
import { intervalsOverlap } from './overlap';
import { findResourceOccupancy } from './repository';
import { generateResourceSlots, isSlotAvailable, isSlotPast, resolveSlotStatus } from './slots';
import { limaWallTimeToUtc } from './time';

/**
 * Mismo patrón que `dateOnlySchema` de `packages/validation/src/common.ts`
 * (`/^\d{4}-\d{2}-\d{2}$/`): se revalida aquí, en el orquestador, para que la
 * función siga siendo correcta si algún día se invoca fuera del handler HTTP
 * (p. ej. un job interno), sin depender de que el llamante ya haya pasado por
 * `parseQuery`/Zod.
 */
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface GetResourceAvailabilityInput {
  resourceId: string;
  /** `YYYY-MM-DD`, hora local del club (contrato §6). */
  date: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable, para pruebas deterministas ("ahora"). */
  now?: Date;
}

/**
 * Procesa `GET /resources/{resourceId}/availability` de punta a punta
 * (criterios 1-9). Ver cabecera del módulo para el resumen del flujo.
 */
export async function getResourceAvailability(
  input: GetResourceAvailabilityInput,
): Promise<AvailabilityResponse> {
  if (!DATE_ONLY_PATTERN.test(input.date)) {
    throw new AppError('VALIDATION_ERROR', 'El parámetro date debe tener el formato YYYY-MM-DD.');
  }

  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();

  const resource = await getResourceById(client, input.resourceId);
  if (!resource) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso solicitado.');
  }

  // Catálogo de franjas del día (sin AWS, US-029 Ola 1): "una franja que no
  // cabe completa antes de closesAt no se ofrece" (criterios 2/3) ya lo
  // resuelve `generateResourceSlots`.
  const slots = generateResourceSlots(
    {
      opensAt: resource.opensAt,
      closesAt: resource.closesAt,
      blockMinutes: resource.blockMinutes,
    },
    input.date,
  );

  // Criterio 7 (RN-RES-11): un recurso completo en mantenimiento bloquea
  // todas las franjas del día sin necesidad de consultar ocupación puntual —
  // ni siquiera hace falta llamar a `findResourceOccupancy`.
  if (resource.resourceStatus === 'MAINTENANCE') {
    const maintenanceSlots: AvailabilitySlot[] = slots.map((slot) => ({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      available: false,
      status: 'MAINTENANCE',
    }));
    return {
      resourceId: resource.resourceId,
      date: input.date,
      blockMinutes: resource.blockMinutes,
      resourceStatus: resource.resourceStatus,
      slots: maintenanceSlots,
    };
  }

  // Una sola consulta a GSI3 para todo el día (no por franja, evita N
  // consultas). El rango debe cubrir exactamente [opensAt, closesAt] del día
  // en UTC, no un rango de calendario ingenuo: `closesAt` tarde (p. ej. 22:00
  // Lima de parrilla/salón) cae en el día UTC siguiente (`./time.ts`,
  // `limaWallTimeToUtc`).
  const from = limaWallTimeToUtc(input.date, resource.opensAt).toISOString();
  const to = limaWallTimeToUtc(input.date, resource.closesAt).toISOString();
  const occupancy = await findResourceOccupancy(client, resource.resourceId, { from, to });

  const resolvedSlots: AvailabilitySlot[] = slots.map((slot) => {
    const isPast = isSlotPast(slot.startsAt, now);
    const isMaintenance = occupancy.maintenanceBlocks.some((block) =>
      intervalsOverlap(slot.startsAt, slot.endsAt, block.startsAt, block.endsAt),
    );
    const isReserved = occupancy.activeReservations.some((reservation) =>
      intervalsOverlap(slot.startsAt, slot.endsAt, reservation.startsAt, reservation.endsAt),
    );
    const status = resolveSlotStatus({ isPast, isMaintenance, isReserved });
    return {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      available: isSlotAvailable(status),
      status,
    };
  });

  return {
    resourceId: resource.resourceId,
    date: input.date,
    blockMinutes: resource.blockMinutes,
    resourceStatus: resource.resourceStatus,
    slots: resolvedSlots,
  };
}
