// Generador mock de disponibilidad por día — Ola 1 del Sprint 3 (US-029).
//
// Reproduce EXACTAMENTE la forma de `GET
// /resources/{resourceId}/availability?date=YYYY-MM-DD` documentada en
// `docs/api/contratos-api.md` §6 (`AvailabilityResponse`, `AvailabilitySlot`,
// `AvailabilitySlotStatus`) y las reglas de cálculo de franjas de US-029:
//
// - Franjas desde `opensAt` hasta `closesAt`, en pasos de `blockMinutes`, en
//   `America/Lima`, devueltas en UTC ISO-8601.
// - Una franja que no cabe completa antes de `closesAt` no se ofrece.
// - Si `resourceStatus=MAINTENANCE`, todas las franjas del día llegan con
//   `available=false` y `status=MAINTENANCE`.
// - Precedencia cuando aplica más de un motivo: `PAST` -> `MAINTENANCE` ->
//   `RESERVED`.
//
// Reconciliación pendiente cuando el backend esté listo (US-032): esta
// función deja de invocarse; `resources-client.ts` llama directamente a
// `apiRequest` contra el endpoint real, que calcula lo mismo a partir de
// reservas activas (GSI3) y bloqueos de mantenimiento reales, no de los
// índices mock de `catalog-mock-data.ts`.

import type {
  AvailabilityResponse,
  AvailabilitySlot,
  AvailabilitySlotStatus,
  Resource,
} from '@activa-club/shared-types';
import { addMinutesToTime, isTimeAfter, limaLocalTimeToUtcIso } from '../lib/format/lima-time';
import { MOCK_MAINTENANCE_SLOT_INDEXES, MOCK_RESERVED_SLOT_INDEXES } from './catalog-mock-data';

export function generateMockAvailability(
  resource: Resource,
  date: string,
  now: Date = new Date(),
): AvailabilityResponse {
  const slots: AvailabilitySlot[] = [];
  const reservedIndexes = new Set(MOCK_RESERVED_SLOT_INDEXES[resource.resourceId] ?? []);
  const maintenanceIndexes = new Set(MOCK_MAINTENANCE_SLOT_INDEXES[resource.resourceId] ?? []);

  let cursor = resource.opensAt;
  let index = 0;
  while (true) {
    const slotEnd = addMinutesToTime(cursor, resource.blockMinutes);
    // Una franja que no cabe completa antes de closesAt no se ofrece.
    if (isTimeAfter(slotEnd, resource.closesAt)) break;

    const startsAt = limaLocalTimeToUtcIso(date, cursor);
    const endsAt = limaLocalTimeToUtcIso(date, slotEnd);
    const status = resolveSlotStatus({
      resourceStatus: resource.resourceStatus,
      isReserved: reservedIndexes.has(index),
      isMaintenance: maintenanceIndexes.has(index),
      isPast: new Date(startsAt).getTime() < now.getTime(),
    });

    slots.push({ startsAt, endsAt, available: status === 'AVAILABLE', status });

    cursor = slotEnd;
    index += 1;
  }

  return {
    resourceId: resource.resourceId,
    date,
    blockMinutes: resource.blockMinutes,
    resourceStatus: resource.resourceStatus,
    slots,
  };
}

interface ResolveSlotStatusInput {
  resourceStatus: Resource['resourceStatus'];
  isReserved: boolean;
  isMaintenance: boolean;
  isPast: boolean;
}

/** Precedencia cuando aplica más de un motivo: `PAST` -> `MAINTENANCE` ->
 * `RESERVED` (US-029, "Reglas de cálculo de franjas"). */
function resolveSlotStatus({
  resourceStatus,
  isReserved,
  isMaintenance,
  isPast,
}: ResolveSlotStatusInput): AvailabilitySlotStatus {
  if (isPast) return 'PAST';
  if (resourceStatus === 'MAINTENANCE' || isMaintenance) return 'MAINTENANCE';
  if (isReserved) return 'RESERVED';
  return 'AVAILABLE';
}
