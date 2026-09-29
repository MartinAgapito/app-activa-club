// Cliente de catálogo y disponibilidad de instalaciones (US-028, US-029).
//
// Ambos endpoints están desplegados y reales: `GET /resources` (US-028) y
// `GET /resources/{resourceId}/availability?date=` (US-029,
// docs/api/contratos-api.md §6). Mismo patrón que `members/plans-client.ts`:
// delegan directo en `apiRequest`, que ya normaliza errores al formato
// estándar del contrato. Sin datos simulados: los mocks de Ola 1
// (`catalog-mock-data.ts`, `availability-mock.ts`) se retiraron al quedar sin
// uso una vez reconciliadas las dos funciones de este módulo.

import type { AvailabilityResponse, Resource } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** `GET /resources` (member, admin). Catálogo completo, incluidos los
 * recursos en mantenimiento (US-028, criterio 8). */
export function fetchResources(): Promise<Resource[]> {
  return apiRequest<Resource[]>('/resources');
}

export interface FetchResourceAvailabilityParams {
  resourceId: string;
  /** `YYYY-MM-DD`, hora local del club (`America/Lima`). */
  date: string;
}

/** `GET /resources/{resourceId}/availability?date=YYYY-MM-DD` (member). */
export function fetchResourceAvailability({
  resourceId,
  date,
}: FetchResourceAvailabilityParams): Promise<AvailabilityResponse> {
  return apiRequest<AvailabilityResponse>(
    `/resources/${encodeURIComponent(resourceId)}/availability?date=${encodeURIComponent(date)}`,
  );
}
