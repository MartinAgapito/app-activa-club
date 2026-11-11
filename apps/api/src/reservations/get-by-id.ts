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
import type { MemberNameSummary, ReservationDetail, Role } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub, getMemberById } from '../members/repository';
import { getReservationById, getReservationParticipants } from './repository';

/**
 * Nombres de los socios participantes (US-080, ADR-0014, patrón #31). Los
 * `memberId` se deduplican y se leen por clave en paralelo (≤ 31, sin Scan);
 * solo se proyecta `memberId`, nombre y apellido. Un socio no resoluble da
 * `null` (la respuesta sigue siendo 200).
 */
async function resolveMemberNames(
  client: DynamoDBDocumentClient,
  memberIds: string[],
): Promise<Map<string, MemberNameSummary | null>> {
  const distinct = [...new Set(memberIds)];
  const resolved = await Promise.all(
    distinct.map(async (memberId): Promise<[string, MemberNameSummary | null]> => {
      const member = await getMemberById(client, memberId);
      return [
        memberId,
        member
          ? { memberId: member.memberId, firstName: member.firstName, lastName: member.lastName }
          : null,
      ];
    }),
  );
  return new Map(resolved);
}

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
  const memberIds = participants
    .filter((participant) => participant.participantType !== 'GUEST')
    .flatMap((participant) => (participant.memberId ? [participant.memberId] : []));
  const names = await resolveMemberNames(client, memberIds);

  return {
    ...reservation,
    participants: participants.map((participant) => ({
      ...participant,
      member:
        participant.participantType !== 'GUEST' && participant.memberId
          ? (names.get(participant.memberId) ?? null)
          : null,
    })),
  };
}
