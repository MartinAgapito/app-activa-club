// Cliente de bloqueos por mantenimiento — US-035.
//
// Endpoints reales de docs/api/contratos-api.md §6, todos con rol `admin`:
// `POST /resources/{id}/maintenance` (201), `GET /resources/{id}/maintenance`
// y `DELETE /resources/{id}/maintenance/{blockId}` (204 sin cuerpo:
// `apiRequest` ya lo resuelve como `undefined`).

import type {
  CreateMaintenanceRequest,
  CreateMaintenanceResponse,
  ListMaintenanceResponse,
} from '@activa-club/shared-types';
import { apiRequest } from '../../lib/api/http-client';

/** Crea un bloqueo. La respuesta incluye `affectedReservationCount`: las
 * reservas existentes dentro de la ventana NO se cancelan. */
export function createMaintenanceBlock(
  resourceId: string,
  request: CreateMaintenanceRequest,
): Promise<CreateMaintenanceResponse> {
  return apiRequest<CreateMaintenanceResponse>(
    `/resources/${encodeURIComponent(resourceId)}/maintenance`,
    { method: 'POST', body: request },
  );
}

/** Bloqueos vigentes y futuros del recurso (sin `from`/`to`), ordenados por
 * inicio ascendente y sin paginación. */
export function listMaintenanceBlocks(resourceId: string): Promise<ListMaintenanceResponse> {
  return apiRequest<ListMaintenanceResponse>(
    `/resources/${encodeURIComponent(resourceId)}/maintenance`,
  );
}

/** Libera un bloqueo. 204 sin cuerpo; 404 `NOT_FOUND` si ya no existe. */
export function releaseMaintenanceBlock(resourceId: string, blockId: string): Promise<void> {
  return apiRequest<void>(
    `/resources/${encodeURIComponent(resourceId)}/maintenance/${encodeURIComponent(blockId)}`,
    { method: 'DELETE' },
  );
}
