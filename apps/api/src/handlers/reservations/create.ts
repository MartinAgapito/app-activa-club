// POST /reservations — crea una reserva con validación completa en servidor
// (docs/api/contratos-api.md §7,
// docs/scrum/historias/US-030-crear-reserva-confirmacion-automatica.md).
// Solo `member`: el titular es siempre el socio autenticado (RN-RES-06),
// nunca un `memberId`/`holderMemberId` de la solicitud (que ni siquiera
// existe en el contrato de entrada).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import type {
  CreateReservationRequest,
  ReservationParticipantInput,
} from '@activa-club/shared-types';
import { createReservationSchema } from '@activa-club/validation';

import { jsonResponse, parseJsonBody } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { createReservation } from '../../reservations/create';

type ParsedParticipant = ReturnType<typeof createReservationSchema.parse>['participants'][number];

/**
 * Adapta un participante parseado por Zod (campos opcionales tipados como
 * `string | undefined`) a `ReservationParticipantInput` (`exactOptionalPropertyTypes`,
 * mismo ajuste que `toCreateReservationRequest` de más abajo). Esta historia
 * (US-030) no usa el contenido de `participants` — se ignora deliberadamente
 * en `../../reservations/create.ts` (alcance de US-031) — pero el body debe
 * seguir adaptándose al tipo del contrato para que el handler compile y para
 * que, cuando US-031 lo consuma, ya llegue con la forma correcta.
 */
function toReservationParticipantInput(data: ParsedParticipant): ReservationParticipantInput {
  return {
    type: data.type,
    ...(data.memberId !== undefined ? { memberId: data.memberId } : {}),
    ...(data.dni !== undefined ? { dni: data.dni } : {}),
    ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
    ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
  };
}

/**
 * Adapta la salida de `createReservationSchema.safeParse` a
 * `CreateReservationRequest`. Necesario porque Zod tipa `notes`
 * (`.optional()`) como `string | undefined`, mientras el DTO declara
 * `notes?: string`; con `exactOptionalPropertyTypes` solo se puede asignar
 * omitiendo la clave cuando no hay valor (mismo ajuste que
 * `toRegistrationRequest`, `../registration/post.ts`).
 */
function toCreateReservationRequest(
  data: ReturnType<typeof createReservationSchema.parse>,
): CreateReservationRequest {
  return {
    resourceId: data.resourceId,
    startsAt: data.startsAt,
    participants: data.participants.map(toReservationParticipantInput),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
  };
}

async function handleCreateReservation(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member']);

  const parsed = parseJsonBody(event.body, createReservationSchema);
  const request = toCreateReservationRequest(parsed);

  const result = await createReservation({ cognitoSub: identity.sub, request });

  return jsonResponse(201, result);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'CREATE_RESERVATION',
  handleCreateReservation,
);
