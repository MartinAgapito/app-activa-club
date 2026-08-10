// Queries de catálogo y disponibilidad de instalaciones — US-028, US-029.
//
// Centraliza las `queryKey` y `queryFn`, igual que `members/plans-query.ts`,
// para que cualquier pantalla que necesite el catálogo o la disponibilidad de
// un recurso (esta Ola 1 y, después, el flujo completo de reserva de US-032)
// comparta la misma entrada de caché de TanStack Query.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AvailabilityResponse, Resource } from '@activa-club/shared-types';
import { fetchResourceAvailability, fetchResources } from './resources-client';

export const RESOURCES_QUERY_KEY = ['resources'] as const;

export function useResourcesQuery(): UseQueryResult<Resource[]> {
  return useQuery({ queryKey: RESOURCES_QUERY_KEY, queryFn: fetchResources });
}

export function resourceAvailabilityQueryKey(resourceId: string, date: string) {
  return ['resources', resourceId, 'availability', date] as const;
}

/** `resourceId`/`date` nulos deshabilitan la consulta (todavía no hay
 * instalación o día elegido, US-029 criterio "puede cambiar de día y de
 * recurso"). */
export function useResourceAvailabilityQuery(
  resourceId: string | null,
  date: string | null,
): UseQueryResult<AvailabilityResponse> {
  return useQuery({
    queryKey: resourceAvailabilityQueryKey(resourceId ?? '', date ?? ''),
    queryFn: () => fetchResourceAvailability({ resourceId: resourceId!, date: date! }),
    enabled: Boolean(resourceId) && Boolean(date),
  });
}
