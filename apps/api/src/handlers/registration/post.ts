// POST /registration — registro de socio nuevo (docs/api/contratos-api.md §3,
// docs/scrum/historias/US-016-registro-socio-nuevo.md, RN-ACT-03/05/06/07).
//
// Endpoint público (sin Cognito Authorizer, US-011): valida el cuerpo con
// `registrationSchema` y delega la verificación de unicidad, la creación del
// usuario Cognito y la persistencia del socio `PENDING` en
// `src/registration/register.ts`.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { RegistrationRequest } from '@activa-club/shared-types';
import { registrationSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { withHandler } from '../../middleware/with-handler';
import { registerMember } from '../../registration/register';

/**
 * Adapta la salida de `registrationSchema.safeParse` a `RegistrationRequest`.
 * Necesario porque Zod tipa `phone` (`.optional()`) como `string | undefined`,
 * mientras el DTO declara `phone?: string`; con `exactOptionalPropertyTypes`
 * solo se puede asignar omitiendo la clave cuando no hay valor (mismo ajuste
 * que `toLegacyMember` en `../../migration/run.ts`).
 */
function toRegistrationRequest(
  data: ReturnType<typeof registrationSchema.parse>,
): RegistrationRequest {
  return {
    dni: data.dni,
    email: data.email,
    password: data.password,
    firstName: data.firstName,
    lastName: data.lastName,
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
  };
}

async function handleRegister(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const parsed = parseJsonBody(event.body, registrationSchema);
  const request = toRegistrationRequest(parsed);

  const result = await registerMember({ request });

  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyEvent>('REGISTER_MEMBER', handleRegister);
