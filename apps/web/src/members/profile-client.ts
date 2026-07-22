// Cliente del perfil propio del socio autenticado — US-018.
//
// `GET /members/me` y `PATCH /members/me` (docs/api/contratos-api.md §4)
// resuelven al socio siempre por su sesión (`cognitoSub`), nunca por un
// parámetro de la URL: un socio solo puede ver y editar su propio perfil. El
// único dato editable por este camino es `phone` (RN-ACT-02/03: el DNI y el
// correo de identidad no se editan aquí). Reutiliza `apiRequest`
// (lib/api/http-client.ts), que ya normaliza los errores al formato estándar
// del contrato.

import type { Member, UpdateMemberRequest } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Perfil propio del socio autenticado, incluyendo su estado de socio y de
 * membresía en modo lectura (criterio de aceptación 1). */
export function fetchMemberProfile(): Promise<Member> {
  return apiRequest<Member>('/members/me');
}

/** Actualiza los datos de contacto propios del socio (criterio de aceptación
 * 2). Devuelve el perfil actualizado completo. */
export function updateMemberProfile(request: UpdateMemberRequest): Promise<Member> {
  return apiRequest<Member>('/members/me', {
    method: 'PATCH',
    body: request,
  });
}
