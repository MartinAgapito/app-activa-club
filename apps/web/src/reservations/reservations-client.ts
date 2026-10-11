// Cliente de creación de reservas y búsqueda de participantes (US-032).
//
// Endpoints reales (docs/api/contratos-api.md §4 y §7): `POST /reservations`,
// `GET /members/lookup?dni=` y `GET /guests/lookup?dni=`. Sin mocks: delegan
// en `apiRequest`, que ya normaliza errores al formato estándar del contrato.

import type {
  CreateReservationRequest,
  CreateReservationResponse,
  GuestLookupResponse,
  MemberLookupResponse,
} from '@activa-club/shared-types';
import { ApiRequestError, apiRequest } from '../lib/api/http-client';

/** `POST /reservations` (member). El titular es el socio autenticado. */
export function createReservation(
  request: CreateReservationRequest,
): Promise<CreateReservationResponse> {
  return apiRequest<CreateReservationResponse>('/reservations', {
    method: 'POST',
    body: request,
  });
}

/** `GET /members/lookup?dni=` (member). Lanza `ApiRequestError` con código
 * `DNI_NOT_FOUND` (404) si el DNI no resuelve a un socio del club. */
export function lookupMemberByDni(dni: string): Promise<MemberLookupResponse> {
  return apiRequest<MemberLookupResponse>(`/members/lookup?dni=${encodeURIComponent(dni)}`);
}

/** `GET /guests/lookup?dni=` (member | admin). Un 404 NO es un error de
 * negocio: significa que ese DNI nunca fue invitado y la interfaz debe pedir
 * nombre y apellido (contrato §7). Se devuelve `null` en ese caso. */
export async function lookupGuestByDni(dni: string): Promise<GuestLookupResponse | null> {
  try {
    return await apiRequest<GuestLookupResponse>(`/guests/lookup?dni=${encodeURIComponent(dni)}`);
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return null;
    }
    throw error;
  }
}
