// Cliente de catálogo y disponibilidad de instalaciones — Ola 1 del Sprint 3
// (US-028, US-029), preparación de US-032.
//
// `GET /resources` y `GET /resources/{resourceId}/availability?date=`
// (docs/api/contratos-api.md §6) todavía no están desplegados: US-027
// (endpoints) y US-028/US-029 (backend) corren en paralelo en esta misma
// ola. Este módulo simula la respuesta exacta del contrato —incluida una
// latencia de red realista y los mismos `ApiRequestError` que lanzaría
// `apiRequest`— para que las pantallas y sus pruebas ya se escriban contra
// la forma final.
//
// Reconciliación pendiente cuando el backend esté listo (US-032): reemplazar
// el cuerpo de `fetchResources`/`fetchResourceAvailability` por
// `apiRequest<Resource[]>('/resources')` y
// `apiRequest<AvailabilityResponse>('/resources/{id}/availability?date=')`
// (mismo patrón que `members/plans-client.ts`). Ningún componente que
// consuma estas funciones debería cambiar: la forma de los datos ya es la
// del contrato.

import type { AvailabilityResponse, Resource } from '@activa-club/shared-types';
import { ApiRequestError } from '../lib/api/http-client';
import { RESOURCE_CATALOG } from './catalog-mock-data';
import { generateMockAvailability } from './availability-mock';

const MOCK_NETWORK_DELAY_MS = 250;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function wait(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_NETWORK_DELAY_MS));
}

/** `GET /resources` (member, admin). Catálogo completo, incluidos los
 * recursos en mantenimiento (US-028, criterio 8). */
export async function fetchResources(): Promise<Resource[]> {
  await wait();
  return RESOURCE_CATALOG;
}

export interface FetchResourceAvailabilityParams {
  resourceId: string;
  /** `YYYY-MM-DD`, hora local del club (`America/Lima`). */
  date: string;
}

/** `GET /resources/{resourceId}/availability?date=YYYY-MM-DD` (member). */
export async function fetchResourceAvailability({
  resourceId,
  date,
}: FetchResourceAvailabilityParams): Promise<AvailabilityResponse> {
  await wait();

  if (!ISO_DATE_PATTERN.test(date)) {
    throw new ApiRequestError(
      400,
      'VALIDATION_ERROR',
      'La fecha debe tener el formato AAAA-MM-DD.',
    );
  }

  const resource = RESOURCE_CATALOG.find((item) => item.resourceId === resourceId);
  if (!resource) {
    throw new ApiRequestError(404, 'NOT_FOUND', 'No encontramos esa instalación.');
  }

  return generateMockAvailability(resource, date);
}
