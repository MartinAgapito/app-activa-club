// POST /activation/complete — completa la activación de un socio migrado
// (docs/api/contratos-api.md §3, docs/scrum/historias/US-013-activacion-cuenta-socio-dni.md,
// RN-ACT-01/02/03/04).
//
// Endpoint público (sin Cognito Authorizer, US-011): valida el cuerpo con
// `completeActivationSchema` y delega la revalidación de elegibilidad, la
// creación del usuario Cognito y el enlace del socio migrado en
// `src/activation/complete.ts`.

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { completeActivationSchema } from '@activa-club/validation';

import { completeActivation } from '../../activation/complete';
import { jsonResponse, parseJsonBody } from '../../lib/http';
import { withHandler } from '../../middleware/with-handler';

async function handleComplete(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const request = parseJsonBody(event.body, completeActivationSchema);
  const result = await completeActivation({ request });
  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyEvent>('COMPLETE_ACTIVATION', handleComplete);
