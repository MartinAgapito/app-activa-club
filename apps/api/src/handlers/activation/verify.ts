// POST /activation/verify — verifica DNI de socio migrado (docs/api/contratos-api.md §3,
// docs/scrum/historias/US-013-activacion-cuenta-socio-dni.md, RN-ACT-01/02/03).
//
// Endpoint público (sin Cognito Authorizer, US-011): valida el cuerpo con
// `verifyDniSchema` y delega la resolución del DNI y la verificación de
// elegibilidad en `src/activation/verify.ts`.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { verifyDniSchema } from '@activa-club/validation';

import { verifyActivation } from '../../activation/verify';
import { jsonResponse, parseJsonBody } from '../../lib/http';
import { withHandler } from '../../middleware/with-handler';

async function handleVerify(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const request = parseJsonBody(event.body, verifyDniSchema);
  const result = await verifyActivation({ request });
  return jsonResponse(200, result);
}

export const handler = withHandler<APIGatewayProxyEvent>('VERIFY_ACTIVATION', handleVerify);
