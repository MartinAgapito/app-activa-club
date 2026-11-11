// Resolución en lectura del nombre del socio de cada pago (US-081, ADR-0014,
// patrón #31 del modelo de datos): un `GetItem` por `memberId` distinto, en
// paralelo, con proyección de nombre. Mismo mecanismo que `holder` en
// `GET /reservations?scope=all`; no se denormaliza en el ítem `Payment`.
//
// Solo se proyectan `memberId`, `firstName` y `lastName`: nunca DNI, correo,
// teléfono ni estado de membresía.
//
// Degradación: un socio no resoluble, o una lectura que falla (p. ej.
// `AccessDeniedException` mientras la Lambda `payments-list` aún no tenga
// `dynamodb:GetItem`), da `null` y se registra un WARN; el listado sigue
// respondiendo 200 sin el nombre en vez de romperse.

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MemberNameSummary } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';
import { logger } from '../lib/logger';

/** Máximo de lecturas simultáneas (una página trae a lo sumo 100 pagos). */
const MAX_PARALLEL_READS = 100;

export interface ResolveMemberNamesOptions {
  requestId: string;
}

async function readMemberName(
  client: DynamoDBDocumentClient,
  memberId: string,
  options: ResolveMemberNamesOptions,
): Promise<MemberNameSummary | null> {
  try {
    const result = await client.send(
      new GetCommand({
        TableName: tableName(),
        Key: keys.member(memberId),
        ProjectionExpression: 'memberId, firstName, lastName',
      }),
    );
    const item = result.Item;
    if (!item) return null;
    return {
      memberId: String(item['memberId'] ?? memberId),
      firstName: String(item['firstName'] ?? ''),
      lastName: String(item['lastName'] ?? ''),
    };
  } catch (error) {
    logger.warn('payment member name lookup failed', {
      requestId: options.requestId,
      entityType: 'Member',
      action: 'RESOLVE_PAYMENT_MEMBER_NAME',
      outcome: 'FAILURE',
      memberId,
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return null;
  }
}

/** Resuelve el nombre de cada `memberId` distinto (una sola lectura por clave). */
export async function resolveMemberNames(
  client: DynamoDBDocumentClient,
  memberIds: readonly string[],
  options: ResolveMemberNamesOptions,
): Promise<Map<string, MemberNameSummary | null>> {
  const distinct = [...new Set(memberIds)];
  const names = new Map<string, MemberNameSummary | null>();

  for (let i = 0; i < distinct.length; i += MAX_PARALLEL_READS) {
    const chunk = distinct.slice(i, i + MAX_PARALLEL_READS);
    const resolved = await Promise.all(
      chunk.map(
        async (memberId) => [memberId, await readMemberName(client, memberId, options)] as const,
      ),
    );
    for (const [memberId, name] of resolved) names.set(memberId, name);
  }

  return names;
}

/** Agrega `member` a cada pago (solo para `admin`; el llamante decide el rol). */
export async function withMemberNames<T extends { memberId: string }>(
  client: DynamoDBDocumentClient,
  payments: readonly T[],
  options: ResolveMemberNamesOptions,
): Promise<Array<T & { member: MemberNameSummary | null }>> {
  const names = await resolveMemberNames(
    client,
    payments.map((payment) => payment.memberId),
    options,
  );
  return payments.map((payment) => ({ ...payment, member: names.get(payment.memberId) ?? null }));
}
