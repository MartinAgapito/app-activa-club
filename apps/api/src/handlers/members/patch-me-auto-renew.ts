// PATCH /members/me/auto-renew — activa o desactiva la renovación automática
// del socio autenticado (docs/api/contratos-api.md §4,
// docs/scrum/historias/US-023-renovacion-membresia-autorenovacion.md,
// RN-PAG-03).
//
// Un socio solo puede modificar su propia preferencia: la identidad se
// deriva del `cognitoSub` del JWT (no hay `memberId` en la ruta ni en el
// body) — un intento de modificar la de otro socio no es un caso a validar,
// simplemente no existe forma de expresarlo en la solicitud (criterio 9). Un
// socio `PENDING`/`REJECTED` no puede usar este endpoint (403/422
// `MEMBER_NOT_APPROVED`, criterio 3).
//
// Fuera de alcance de esta historia: cualquier mecanismo de cobro automático
// desatendido. Este endpoint solo captura/revoca la autorización explícita
// del socio (ver "Alcance de la renovación automática" en la historia); el
// cobro real de una renovación sigue pasando por `POST /payments` (US-021).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { autoRenewSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { updateMemberAutoRenew } from '../../members/update-auto-renew';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';

async function handleUpdateAutoRenew(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const { enabled } = parseJsonBody(event.body, autoRenewSchema);
  const member = await updateMemberAutoRenew({ cognitoSub: identity.sub, enabled });

  return jsonResponse(200, member);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'UPDATE_MEMBER_AUTO_RENEW',
  handleUpdateAutoRenew,
);
