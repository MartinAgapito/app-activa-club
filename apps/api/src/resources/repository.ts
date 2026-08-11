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

import { ScanCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Resource } from '@activa-club/shared-types';

import { tableName } from '../lib/dynamo';

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
