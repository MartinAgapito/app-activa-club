// Orquestador de `GET /reservations` (US-033, docs/api/contratos-api.md §7,
// criterios 1/2). El handler (`../handlers/reservations/list.ts`) resuelve
// `scope` (default `me`) y ya aplicó `requireRole` (`me` → member, `all` →
// admin, ADR-0002) antes de llegar aquí; este módulo solo decide **qué
// consulta** correr según `scope` y qué filtros vinieron.
//
// - `scope=me`: siempre las reservas del socio autenticado como **titular**
//   (RN-RES-06) — resuelto por `cognitoSub`, nunca por un `memberId` de la
//   query (mismo criterio de seguridad que `../payments/repository.ts`,
//   `listPaymentsByMember`). `status`/`resourceId`/`from`/`to` se aplican
//   como filtro adicional dentro de esa misma partición
//   (`listReservationsByHolder`).
// - `scope=all`: lectura administrativa sin restricción de titular. El
//   modelo de datos no define un patrón de acceso "todas sin filtro"
//   (docs/data/modelo-dynamodb.md §4): igual que `GET /members` y
//   `GET /payments` (admin sin `memberId`), se exige al menos un filtro que
//   sí tenga índice. Entre `status` y `resourceId`, `status` tiene
//   precedencia (es el filtro más habitual del panel admin: la bandeja de
//   pendientes de aprobación que reutiliza US-034, `status=PENDING_APPROVAL`)
//   y `resourceId` se aplica ahí como filtro adicional si también vino; si
//   solo vino `resourceId`, se usa GSI3. Sin ninguno de los dos, 400
//   `VALIDATION_ERROR` — nunca un `Scan` completo de la tabla.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  AdminReservationListItem,
  Paginated,
  Reservation,
  ReservationHolderSummary,
  ReservationStatus,
} from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub, getMemberById } from '../members/repository';
import {
  listReservationsByHolder,
  listReservationsByResource,
  listReservationsByStatus,
} from './repository';

export interface ListReservationsInput {
  /** `cognitoSub` de la identidad autenticada; solo se usa cuando `scope==='me'`. */
  cognitoSub: string;
  scope: 'me' | 'all';
  status?: ReservationStatus;
  resourceId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

/**
 * Agrega a cada reserva el socio titular (US-036, criterio 8). Los
 * `holderMemberId` se deduplican y se resuelven en paralelo (una página tiene
 * como máximo `limit` reservas, muchas del mismo socio); solo se expone
 * `memberId`, nombre y apellido. Un socio no resoluble da `holder: null`.
 */
async function withHolders(
  client: DynamoDBDocumentClient,
  page: Paginated<Reservation>,
): Promise<Paginated<AdminReservationListItem>> {
  const holderIds = [...new Set(page.items.map((reservation) => reservation.holderMemberId))];
  const resolved = await Promise.all(
    holderIds.map(async (memberId): Promise<[string, ReservationHolderSummary | null]> => {
      const member = await getMemberById(client, memberId);
      return [
        memberId,
        member
          ? { memberId: member.memberId, firstName: member.firstName, lastName: member.lastName }
          : null,
      ];
    }),
  );
  const holders = new Map(resolved);
  return {
    ...page,
    items: page.items.map((reservation) => ({
      ...reservation,
      holder: holders.get(reservation.holderMemberId) ?? null,
    })),
  };
}

export async function listReservations(
  input: ListReservationsInput,
): Promise<Paginated<Reservation> | Paginated<AdminReservationListItem>> {
  const client = input.client ?? getDocumentClient();
  const pageOptions = {
    ...(input.from !== undefined ? { from: input.from } : {}),
    ...(input.to !== undefined ? { to: input.to } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };

  if (input.scope === 'me') {
    const member = await findMemberByCognitoSub(client, input.cognitoSub);
    if (!member) {
      // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
      throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
    }
    return listReservationsByHolder(client, member.memberId, {
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...pageOptions,
    });
  }

  // scope === 'all' (admin, ya autorizado por el handler).
  if (input.status !== undefined) {
    const page = await listReservationsByStatus(client, input.status, {
      ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
      ...pageOptions,
    });
    return withHolders(client, page);
  }
  if (input.resourceId !== undefined) {
    const page = await listReservationsByResource(client, input.resourceId, pageOptions);
    return withHolders(client, page);
  }
  throw new AppError(
    'VALIDATION_ERROR',
    'Debe indicar status o resourceId para listar todas las reservas.',
  );
}
