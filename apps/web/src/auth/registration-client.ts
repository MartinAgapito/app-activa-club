// Cliente del registro de socio nuevo — US-016.
//
// A diferencia de login/recuperación de contraseña (Cognito directo, ver
// cognito-client.ts), el registro sí es un endpoint HTTP propio del backend
// (`POST /registration`, docs/api/contratos-api.md §3): el backend valida la
// unicidad de DNI/correo (RN-ACT-03), crea el `Member` en estado `PENDING` y
// el usuario Cognito (grupo `member`) server-side. El cliente reutiliza
// `apiRequest` (lib/api/http-client.ts), que ya normaliza los errores al
// formato estándar del contrato (`ApiRequestError` con `code`/`details`), sin
// necesidad de un mapeo de errores propio como el de Cognito.

import type { RegistrationRequest, RegistrationResponse } from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Registra un socio nuevo (RN-ACT-05/06). El socio queda `PENDING` hasta la
 * aprobación administrativa y no inicia sesión automáticamente. La
 * contraseña solo viaja en el cuerpo de esta petición: nunca se registra en
 * logs ni se persiste en el cliente. */
export function registerMember(request: RegistrationRequest): Promise<RegistrationResponse> {
  return apiRequest<RegistrationResponse>('/registration', {
    method: 'POST',
    body: request,
  });
}
