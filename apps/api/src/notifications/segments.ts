// Resolución de los destinatarios de una publicación segmentada (US-048,
// RN-NOT-03, EP-05 preguntas abiertas 10 y 12).
//
// Sin `Scan` (criterio 12) y sin índices nuevos:
//   - `ALL`: `Query` GSI2 de los socios `ACTIVE` y de los `APPROVED` (patrón #14).
//   - `ACTIVE`/`DEBT`/`EXPIRED`/`EXPIRING_SOON`: `Query` GSI2
//     `MEMBER#STATUS#ACTIVE` y filtro en memoria sobre `membershipStatus` y
//     `outstandingBalance` (patrón #28; la situación de membresía no es parte
//     de la clave).
//   - `SINGLE`: `GetItem` del socio (patrón #1).
//   - `BY_RESOURCE`: `GetItem` del recurso (§3.7), `Query` GSI3 del recurso
//     (patrón #19, reservas activas y futuras) y `GetItem` de cada titular
//     distinto.
//
// Solo se consideran socios con cuenta digital (`ACTIVE` o `APPROVED`): los
// demás no tienen bandeja que leer. Cada socio aparece una sola vez aunque
// pertenezca al segmento por varios motivos (criterio 8).
//
// Topes (acotan lectura y escritura; superarlos es un error, nunca un
// truncamiento silencioso, para no publicar a medias):
//   - `MAX_MEMBER_PAGES` páginas de 100 socios por estado (2.000 socios).
//   - `MAX_RECIPIENTS` destinatarios por publicación.

import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  MembershipStatus,
  MemberStatus,
  NotificationSegment,
} from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findResourceOccupancy } from '../reservations/repository';
import { getResourceById } from '../resources/repository';

/** Máximo de destinatarios de una publicación. */
export const MAX_RECIPIENTS = 500;
/** Páginas de `Query` por estado de socio al resolver un segmento (100 ítems por página). */
export const MAX_MEMBER_PAGES = 20;
const MEMBER_PAGE_SIZE = 100;
/** Titulares de `BY_RESOURCE` leídos en paralelo. */
const HOLDER_LOOKUP_CONCURRENCY = 10;
/** Fin de la ventana "reservas futuras" de `BY_RESOURCE`. */
const FAR_FUTURE = '9999-12-31T23:59:59.999Z';

/** Destinatario resuelto: lo mínimo para escribir su bandeja y, si aplica, su correo. */
export interface SegmentRecipient {
  memberId: string;
  email: string | null;
  firstName: string;
}

export interface ResolveSegmentInput {
  segment: NotificationSegment;
  targetMemberId?: string | undefined;
  resourceId?: string | undefined;
  /** Instante de referencia ISO (reservas "futuras" de BY_RESOURCE). */
  now: string;
}

interface MemberProjection {
  memberId?: unknown;
  email?: unknown;
  firstName?: unknown;
  memberStatus?: MemberStatus;
  membershipStatus?: MembershipStatus;
  outstandingBalance?: unknown;
}

const PROJECTION = 'memberId, email, firstName, memberStatus, membershipStatus, outstandingBalance';

const DIGITAL_ACCOUNT_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'APPROVED']);

function hasDigitalAccount(member: MemberProjection): boolean {
  return (
    typeof member.memberStatus === 'string' && DIGITAL_ACCOUNT_STATUSES.has(member.memberStatus)
  );
}

function outstanding(member: MemberProjection): number {
  return typeof member.outstandingBalance === 'number' ? member.outstandingBalance : 0;
}

/** Pertenencia a un segmento de situación (`memberStatus` ya validado `ACTIVE`). */
export function matchesSituationSegment(
  segment: Exclude<NotificationSegment, 'ALL' | 'SINGLE' | 'BY_RESOURCE'>,
  member: MemberProjection,
): boolean {
  if (member.memberStatus !== 'ACTIVE') return false;
  const status = member.membershipStatus;
  const debt = status === 'DEBT' || outstanding(member) > 0;
  switch (segment) {
    case 'ACTIVE':
      return (status === 'ACTIVE' || status === 'EXPIRING_SOON') && !debt;
    case 'DEBT':
      return debt;
    case 'EXPIRED':
      return status === 'EXPIRED';
    case 'EXPIRING_SOON':
      return status === 'EXPIRING_SOON';
  }
}

function toRecipient(member: MemberProjection): SegmentRecipient | null {
  if (typeof member.memberId !== 'string' || typeof member.firstName !== 'string') return null;
  return {
    memberId: member.memberId,
    email: typeof member.email === 'string' && member.email !== '' ? member.email : null,
    firstName: member.firstName,
  };
}

/** Lee la partición de un estado de socio (GSI2) hasta agotarla o llegar al tope de páginas. */
async function* membersWithStatus(
  client: DynamoDBDocumentClient,
  status: MemberStatus,
): AsyncGenerator<MemberProjection> {
  const gsi2 = keys.membersByStatus(status);
  let startKey: Record<string, unknown> | undefined;
  for (let page = 0; page < MAX_MEMBER_PAGES; page += 1) {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: { ':pk': gsi2.GSI2PK },
        ProjectionExpression: PROJECTION,
        Limit: MEMBER_PAGE_SIZE,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of result.Items ?? []) yield item as MemberProjection;
    startKey = result.LastEvaluatedKey;
    if (!startKey) return;
  }
  throw new AppError(
    'RECIPIENT_LIMIT_EXCEEDED',
    'El segmento es demasiado grande para publicarlo en una sola operación.',
  );
}

function addRecipient(into: Map<string, SegmentRecipient>, member: MemberProjection): void {
  const recipient = toRecipient(member);
  if (!recipient) return;
  into.set(recipient.memberId, recipient);
  if (into.size > MAX_RECIPIENTS) {
    throw new AppError(
      'RECIPIENT_LIMIT_EXCEEDED',
      `El segmento supera el máximo de ${MAX_RECIPIENTS} destinatarios por publicación.`,
    );
  }
}

async function resolveBySituation(
  client: DynamoDBDocumentClient,
  segment: NotificationSegment,
): Promise<Map<string, SegmentRecipient>> {
  const recipients = new Map<string, SegmentRecipient>();
  const statuses: MemberStatus[] = segment === 'ALL' ? ['ACTIVE', 'APPROVED'] : ['ACTIVE'];
  for (const status of statuses) {
    for await (const member of membersWithStatus(client, status)) {
      if (!hasDigitalAccount(member)) continue;
      if (
        segment === 'ALL' ||
        matchesSituationSegment(
          segment as Exclude<NotificationSegment, 'ALL' | 'SINGLE' | 'BY_RESOURCE'>,
          member,
        )
      ) {
        addRecipient(recipients, member);
      }
    }
  }
  return recipients;
}

async function getMember(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<MemberProjection | undefined> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName(),
      Key: keys.member(memberId),
      ProjectionExpression: PROJECTION,
    }),
  );
  return result.Item as MemberProjection | undefined;
}

async function resolveSingle(
  client: DynamoDBDocumentClient,
  targetMemberId: string,
): Promise<Map<string, SegmentRecipient>> {
  const member = await getMember(client, targetMemberId);
  const recipient = member && hasDigitalAccount(member) ? toRecipient(member) : null;
  if (!recipient) {
    throw new AppError(
      'NOT_FOUND',
      'No se encontró un socio con cuenta digital con ese identificador.',
    );
  }
  return new Map([[recipient.memberId, recipient]]);
}

async function resolveByResource(
  client: DynamoDBDocumentClient,
  resourceId: string,
  now: string,
): Promise<Map<string, SegmentRecipient>> {
  const resource = await getResourceById(client, resourceId);
  if (!resource) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso indicado.');
  }

  const { activeReservations } = await findResourceOccupancy(client, resourceId, {
    from: now,
    to: FAR_FUTURE,
  });
  const holderIds = [...new Set(activeReservations.map((r) => r.holderMemberId))];
  if (holderIds.length > MAX_RECIPIENTS) {
    throw new AppError(
      'RECIPIENT_LIMIT_EXCEEDED',
      `El segmento supera el máximo de ${MAX_RECIPIENTS} destinatarios por publicación.`,
    );
  }

  const recipients = new Map<string, SegmentRecipient>();
  for (let i = 0; i < holderIds.length; i += HOLDER_LOOKUP_CONCURRENCY) {
    const chunk = holderIds.slice(i, i + HOLDER_LOOKUP_CONCURRENCY);
    const members = await Promise.all(chunk.map((id) => getMember(client, id)));
    for (const member of members) {
      if (member && hasDigitalAccount(member)) addRecipient(recipients, member);
    }
  }
  return recipients;
}

/**
 * Resuelve los destinatarios del segmento, sin duplicados. Puede devolver un
 * conjunto vacío (el orquestador decide el rechazo `NO_RECIPIENTS`).
 *
 * @throws AppError `NOT_FOUND` (SINGLE sin cuenta digital, recurso inexistente)
 *   o `RECIPIENT_LIMIT_EXCEEDED`.
 */
export async function resolveSegmentRecipients(
  client: DynamoDBDocumentClient,
  input: ResolveSegmentInput,
): Promise<SegmentRecipient[]> {
  let recipients: Map<string, SegmentRecipient>;
  switch (input.segment) {
    case 'SINGLE':
      if (!input.targetMemberId) {
        throw new AppError('VALIDATION_ERROR', 'El segmento SINGLE requiere targetMemberId.');
      }
      recipients = await resolveSingle(client, input.targetMemberId);
      break;
    case 'BY_RESOURCE':
      if (!input.resourceId) {
        throw new AppError('VALIDATION_ERROR', 'El segmento BY_RESOURCE requiere resourceId.');
      }
      recipients = await resolveByResource(client, input.resourceId, input.now);
      break;
    default:
      recipients = await resolveBySituation(client, input.segment);
  }
  return [...recipients.values()];
}
