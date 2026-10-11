// Acceso a datos del catálogo de instalaciones (`Resource`,
// docs/data/modelo-dynamodb.md §3.7; docs/scrum/historias/US-028-catalogo-recursos-club.md).
//
// `Resource` no tiene GSI propio: son solo diez ítems fijos cargados por
// Terraform (ADR-0010), así que listarlos completos es un `Scan` acotado a la
// tabla (decisión ya tomada en US-027/US-028, no un patrón de acceso nuevo).
// El `Scan` se filtra por `PK`/`SK` (patrón §3.7: `PK=RESOURCE#<id>`,
// `SK=METADATA`) para no arrastrar otras entidades que también usan el
// prefijo `RESOURCE#` en su `PK` (p. ej. `MaintenanceBlock`, §3.11, cuya
// `SK` empieza con `MAINT#`).

import {
  GetCommand,
  ScanCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { Resource, UpdateResourceRequest } from '@activa-club/shared-types';

import { keys, tableName } from '../lib/dynamo';

/**
 * Lista el catálogo completo de recursos, sin filtrar por `resourceStatus`
 * (criterio 8: un recurso en `MAINTENANCE` se devuelve igual, marcado como
 * tal). Un catálogo aún no cargado por Terraform devuelve una lista vacía sin
 * error (caso alternativo "catálogo vacío" de la historia).
 *
 * Sin paginación propia: el catálogo son diez ítems fijos (ADR-0010), muy por
 * debajo del límite de 1 MB de un único `Scan`, así que no hace falta seguir
 * `LastEvaluatedKey` en varias páginas.
 */
export async function listResources(client: DynamoDBDocumentClient): Promise<Resource[]> {
  const result = await client.send(
    new ScanCommand({
      TableName: tableName(),
      FilterExpression: 'begins_with(PK, :prefix) AND SK = :metadata',
      ExpressionAttributeValues: {
        ':prefix': 'RESOURCE#',
        ':metadata': 'METADATA',
      },
    }),
  );

  // TODO(Sprint 1): mismo riesgo señalado en members/repository.ts — validar
  // la forma del ítem leído contra un esquema propio de acceso a datos antes
  // de confiar en el cast.
  return (result.Items ?? []).map((item) => item as unknown as Resource);
}

/**
 * Resuelve un único recurso por `resourceId` (patrón de acceso #1, análogo a
 * `getMemberById`), necesario para validar existencia y leer
 * `capacity`/`opensAt`/`closesAt`/`blockMinutes`/`requiresApproval`/
 * `resourceStatus` al crear una reserva (US-030). A diferencia de
 * `listResources`, esto es un `GetItem` directo por clave (`keys.resource`),
 * no un `Scan`: no hace falta filtrar por `SK` porque la clave ya es exacta.
 */
export async function getResourceById(
  client: DynamoDBDocumentClient,
  resourceId: string,
): Promise<Resource | undefined> {
  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.resource(resourceId) }),
  );
  // TODO(Sprint 1): mismo riesgo señalado arriba — validar la forma del ítem
  // leído contra un esquema propio de acceso a datos antes de confiar en el
  // cast.
  return result.Item ? (result.Item as unknown as Resource) : undefined;
}

/**
 * Actualiza solo los campos editables en runtime de un recurso (US-036,
 * criterio 7: `capacity`, `opensAt`, `closesAt`, `resourceStatus`). Los nombres
 * de atributo salen de una lista cerrada, nunca de las claves del llamante, así
 * que ningún otro atributo (`blockMinutes`, `type`...) puede llegar a la
 * expresión.
 *
 * `attribute_exists(PK)` evita que un `UpdateItem` sobre un `resourceId`
 * inexistente cree un ítem fantasma (mismo cuidado que `UpdateItem` de socios).
 * Devuelve el recurso completo tras el cambio, o `undefined` si no existe.
 */
const UPDATABLE_RESOURCE_FIELDS = ['capacity', 'opensAt', 'closesAt', 'resourceStatus'] as const;

export async function updateResourceFields(
  client: DynamoDBDocumentClient,
  resourceId: string,
  changes: UpdateResourceRequest,
): Promise<Resource | undefined> {
  const fields = UPDATABLE_RESOURCE_FIELDS.filter((field) => changes[field] !== undefined);
  if (fields.length === 0) {
    throw new Error('updateResourceFields requiere al menos un campo a actualizar.');
  }

  try {
    const result = await client.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: keys.resource(resourceId),
        UpdateExpression: `SET ${fields.map((field) => `#${field} = :${field}`).join(', ')}`,
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: Object.fromEntries(fields.map((field) => [`#${field}`, field])),
        ExpressionAttributeValues: Object.fromEntries(
          fields.map((field) => [`:${field}`, changes[field]]),
        ),
        ReturnValues: 'ALL_NEW',
      }),
    );
    return result.Attributes ? (result.Attributes as unknown as Resource) : undefined;
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      return undefined;
    }
    throw error;
  }
}
