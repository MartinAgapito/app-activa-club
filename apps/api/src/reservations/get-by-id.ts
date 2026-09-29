// Orquestador de `GET /reservations/{reservationId}` (US-033, criterios 3/4,
// docs/api/contratos-api.md §7). `member`: solo el detalle de su propia
// reserva (titular, RN-RES-06); `admin`: cualquiera, sin restricción.
//
// Visibilidad ajena (criterio 4): un `member` que pide el detalle de una
// reserva de la que no es titular recibe 404 `NOT_FOUND`, igual que un
// `reservationId` inexistente — mismo criterio y misma justificación que
// `../handlers/payments/get-by-id.ts` (criterio 5 de US-025): 404 en vez de
// 403 no le confirma a un socio que ese `reservationId` existe y es de otro
// socio (mínima superficie de información filtrada).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ReservationDetail, Role } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub } from '../members/repository';
import { getReservationById, getReservationParticipants } from './repository';

export interface GetReservationDetailInput {
  cognitoSub: string;
  roles: Role[];
  reservationId: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

export async function getReservationDetail(
  input: GetReservationDetailInput,
): Promise<ReservationDetail> {
  const client = input.client ?? getDocumentClient();

  const reservation = await getReservationById(client, input.reservationId);
  if (!reservation) {
    throw new AppError('NOT_FOUND', 'No se encontró la reserva indicada.');
  }

  if (!input.roles.includes('admin')) {
    const member = await findMemberByCognitoSub(client, input.cognitoSub);
    if (!member || reservation.holderMemberId !== member.memberId) {
      throw new AppError('NOT_FOUND', 'No se encontró la reserva indicada.');
    }
  }

  const participants = await getReservationParticipants(client, reservation.reservationId);
  return { ...reservation, participants };
}
