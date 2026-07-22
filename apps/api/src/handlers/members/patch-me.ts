// PATCH /members/me — actualiza los datos de contacto propios del socio
// autenticado (docs/api/contratos-api.md §4,
// docs/scrum/historias/US-018-perfil-usuario.md).
//
// Un socio solo puede editar su propio perfil: la identidad se deriva del
// `cognitoSub` del JWT (no hay `memberId` en la ruta). El único campo
// editable es `phone`; el DNI, el correo de identidad y los estados
// (`memberStatus`/`membershipStatus`) no se editan por este camino
// (RN-ACT-02/03) — `updateMemberSchema` descarta cualquier otro campo enviado
// antes de llegar aquí, de forma controlada y sin poner en riesgo la
// unicidad de DNI/correo.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import type { UpdateMemberRequest } from '@activa-club/shared-types';
import { updateMemberSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { updateMemberProfile } from '../../members/update-profile';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

/**
 * Adapta la salida de `updateMemberSchema.safeParse` a `UpdateMemberRequest`.
 * Necesario porque Zod tipa `phone` (`.optional()`) como `string | undefined`,
 * mientras el DTO declara `phone?: string`; con `exactOptionalPropertyTypes`
 * solo se puede asignar omitiendo la clave cuando no hay valor (mismo ajuste
 * que `toRegistrationRequest` en `../registration/post.ts`).
 */
function toUpdateMemberRequest(
  data: ReturnType<typeof updateMemberSchema.parse>,
): UpdateMemberRequest {
  return {
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
  };
}

async function handleUpdateMe(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const parsed = parseJsonBody(event.body, updateMemberSchema);
  const request = toUpdateMemberRequest(parsed);
  const member = await updateMemberProfile({ cognitoSub: identity.sub, request });

  return jsonResponse(200, member);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'UPDATE_MEMBER_ME',
  handleUpdateMe,
);
