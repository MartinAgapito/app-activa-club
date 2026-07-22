// Cliente de activación de cuenta con DNI — US-013.
//
// Igual que registration-client.ts, ambos son endpoints HTTP propios del
// backend (`POST /activation/verify` y `POST /activation/complete`,
// docs/api/contratos-api.md §3): el backend valida elegibilidad del DNI
// (socio migrado sin cuenta, RN-ACT-01/02), crea el usuario Cognito (grupo
// `member`), enlaza `cognitoSub` y transiciona `memberStatus`. El cliente
// reutiliza `apiRequest` (lib/api/http-client.ts), que ya normaliza los
// errores al formato estándar del contrato (`ApiRequestError` con
// `code`/`details`).

import type {
  CompleteActivationRequest,
  CompleteActivationResponse,
  VerifyDniRequest,
  VerifyDniResponse,
} from '@activa-club/shared-types';
import { apiRequest } from '../lib/api/http-client';

/** Verifica si un DNI corresponde a un socio migrado elegible para activar su
 * cuenta digital (RN-ACT-01/02). No crea ningún usuario ni modifica estado. */
export function verifyDni(request: VerifyDniRequest): Promise<VerifyDniResponse> {
  return apiRequest<VerifyDniResponse>('/activation/verify', {
    method: 'POST',
    body: request,
  });
}

/** Completa la activación (RN-ACT-01/03/04): crea el usuario Cognito con el
 * correo y contraseña que define el socio y enlaza la cuenta al socio
 * migrado ya verificado. La contraseña solo viaja en el cuerpo de esta
 * petición: nunca se registra en logs ni se persiste en el cliente. */
export function completeActivation(
  request: CompleteActivationRequest,
): Promise<CompleteActivationResponse> {
  return apiRequest<CompleteActivationResponse>('/activation/complete', {
    method: 'POST',
    body: request,
  });
}
