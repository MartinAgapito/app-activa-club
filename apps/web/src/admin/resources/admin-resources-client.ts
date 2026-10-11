// Cliente administrativo de recursos — US-036.
//
// `PATCH /resources/{resourceId}` (docs/api/contratos-api.md §6, rol `admin`).
// Solo `capacity`, `opensAt`, `closesAt` y `resourceStatus` son editables; el
// servidor rechaza con 400 cualquier otro campo (ADR-0010). El catálogo
// (`GET /resources`) se consume desde `resources/resources-client.ts`.

import type { Resource, UpdateResourceRequest } from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';

/** Actualiza aforo, horario y/o estado de un recurso. Devuelve el `Resource`
 * completo ya actualizado. */
export function updateResource(
  resourceId: string,
  request: UpdateResourceRequest,
): Promise<Resource> {
  return apiRequest<Resource>(`/resources/${encodeURIComponent(resourceId)}`, {
    method: 'PATCH',
    body: request,
  });
}
