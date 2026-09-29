// Orquestador de `GET /members/lookup?dni=` (US-031, docs/api/contratos-api.md
// §4, RN-RES-03, ADR-0009): resuelve un socio por DNI exacto para que el
// titular lo agregue como participante de una reserva (`POST /reservations`,
// US-031). Sin efectos de lado; expone deliberadamente el mínimo
// (`memberId`, `firstName`, `lastName`, criterio 13/14 de US-031).
//
// Dos `GetItem` puntuales (nunca `Query`/`Scan`, ADR-0009): `UNIQ#DNI#<dni>`
// (patrón de acceso #2) para resolver el `memberId`, y `MEMBER#<id>`/`PROFILE`
// (patrón #1) para proyectar solo los campos públicos — nunca correo,
// teléfono, `memberStatus`, `membershipStatus` ni `outstandingBalance` de un
// socio ajeno.

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MemberLookupResponse, MemberStatus } from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { AppError } from '../lib/errors';

/**
 * Socios resolubles como participante de una reserva (RN-ACT-06/07): un
 * `PENDING` o `REJECTED` responde el mismo 404 `DNI_NOT_FOUND` que un DNI
 * inexistente — una solicitud de alta todavía no aprobada (o rechazada) no es
 * un socio del club, y este endpoint tampoco debe servir para averiguar el
 * estado de la solicitud de un tercero.
 */
const RESOLVABLE_MEMBER_STATUSES: ReadonlySet<MemberStatus> = new Set([
  'MIGRATED',
  'APPROVED',
  'ACTIVE',
]);

export interface LookupMemberByDniInput {
  dni: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

interface UniqueDniItem {
  memberId: string;
}

interface MemberProjectionItem {
  memberId: string;
  firstName: string;
  lastName: string;
  memberStatus: MemberStatus;
}

/**
 * Resuelve un socio por DNI exacto, solo si es `MIGRATED`/`APPROVED`/`ACTIVE`
 * (criterio 14 de US-031). 404 `DNI_NOT_FOUND` en cualquier otro caso (DNI sin
 * socio, o socio `PENDING`/`REJECTED`).
 */
export async function lookupMemberByDni(
  input: LookupMemberByDniInput,
): Promise<MemberLookupResponse> {
  const client = input.client ?? getDocumentClient();
  const dni = input.dni.trim();

  const uniqueDniResult = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.uniqueDni(dni) }),
  );
  const memberId = (uniqueDniResult.Item as UniqueDniItem | undefined)?.memberId;
  if (!memberId) {
    throw new AppError('DNI_NOT_FOUND', 'No se encontró un socio con este DNI.');
  }

  const memberResult = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.member(memberId) }),
  );
  const member = memberResult.Item as MemberProjectionItem | undefined;
  if (!member || !RESOLVABLE_MEMBER_STATUSES.has(member.memberStatus)) {
    throw new AppError('DNI_NOT_FOUND', 'No se encontró un socio con este DNI.');
  }

  return {
    memberId: member.memberId,
    firstName: member.firstName,
    lastName: member.lastName,
  };
}
