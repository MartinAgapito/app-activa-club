// Cliente de `PATCH /members/me/auto-renew` — US-023
// (docs/api/contratos-api.md §4, packages/validation/src/member.ts
// `autoRenewSchema`, RN-PAG-03/07).
//
// Igual que `profile-client.ts`: el socio a modificar se resuelve siempre por
// la sesión (`cognitoSub`), nunca por un parámetro de la URL — un socio solo
// puede activar o desactivar su propia preferencia (criterio de aceptación
// 9; un intento sobre otro socio no es posible desde este cliente). No hay
// un cuerpo de respuesta relevante más allá de confirmar el éxito: quien
// llama debe invalidar `MEMBER_PROFILE_QUERY_KEY` para reflejar el nuevo
// valor de `autoRenew` leído de `GET /members/me` (criterio de aceptación 8:
// el estado se lee del backend, nunca se infiere en el cliente).

import type { AutoRenewRequest } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Activa o desactiva la renovación automática del socio autenticado
 * (criterios de aceptación 6 y 7). */
export function updateAutoRenew(request: AutoRenewRequest): Promise<void> {
  return apiRequest<void>('/members/me/auto-renew', {
    method: 'PATCH',
    body: request,
  });
}
