// Acceso a datos del recordatorio de reservas (US-046).
//
// - `listRemindableReservations`: patrón de acceso 21 (GSI3 por recurso y
//   rango). `Query` sobre `GSI3PK = RESOURCE#<id>` con la condición de rango
//   sobre `GSI3SK` (`SLOT#<startsAt>#<reservationId>`), nunca un `Scan`.
//   El rango es semiabierto [from, to): una reserva que empieza exactamente en
//   `to` tiene `GSI3SK = SLOT#<to>#<id>`, mayor que `SLOT#<to>`, así que queda
//   fuera. Los `MaintenanceBlock` comparten partición y se descartan por
//   `entityType`; el estado se filtra en el servidor.
// - `getReminderRecipient`: `GetItem` del titular (patrón #1) con proyección
//   mínima (id, correo y nombre de pila).

import { GetCommand, QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

/** Estados que reciben recordatorio (criterio 3: PENDING/CANCELLED/REJECTED no). */
export const REMINDABLE_STATUSES = ['CONFIRMED', 'APPROVED'] as const;

export interface ReminderRecipient {
  memberId: string;
  email: string | null;
  firstName: string;
}

/**
 * Reservas `CONFIRMED`/`APPROVED` del recurso cuyo inicio cae en [from, to).
 * Sigue `LastEvaluatedKey` hasta agotar la partición: el filtro de estado se
 * aplica después de leer, así que una página puede venir vacía con más datos.
 */
export async function listRemindableReservations(
  client: DynamoDBDocumentClient,
  resourceId: string,
  window: { from: string; to: string },
): Promise<Reservation[]> {
  const { GSI3PK } = keys.reservationsByResource(resourceId);
  const found: Reservation[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName(),
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk AND GSI3SK BETWEEN :from AND :to',
        FilterExpression:
          'entityType = :entityType AND (reservationStatus = :confirmed OR reservationStatus = :approved)',
        ExpressionAttributeValues: {
          ':pk': GSI3PK,
          ':from': `SLOT#${window.from}`,
          ':to': `SLOT#${window.to}`,
          ':entityType': 'Reservation',
          ':confirmed': REMINDABLE_STATUSES[0],
          ':approved': REMINDABLE_STATUSES[1],
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) found.push(item as unknown as Reservation);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return found;
}

/** Titular de la reserva, o `null` si no existe o no tiene nombre. */
export async function getReminderRecipient(
  client: DynamoDBDocumentClient,
  memberId: string,
): Promise<ReminderRecipient | null> {
  const result = await client.send(
    new GetCommand({
      TableName: tableName(),
      Key: keys.member(memberId),
      ProjectionExpression: 'memberId, email, firstName',
    }),
  );
  const item = result.Item as { email?: string | null; firstName?: unknown } | undefined;
  if (!item || typeof item.firstName !== 'string') return null;
  return { memberId, email: item.email ?? null, firstName: item.firstName };
}
