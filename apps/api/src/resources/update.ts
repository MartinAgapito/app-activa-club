// Orquestador de `PATCH /resources/{resourceId}` (US-036, criterios 1-3, 6, 7
// y 11; RN-ADM-04, RN-RES-11, docs/api/contratos-api.md §6).
//
// Solo `capacity`, `opensAt`, `closesAt` y `resourceStatus` son editables: son
// los cuatro campos que Terraform inicializa y nunca revierte (ADR-0010). El
// resto del recurso (`blockMinutes`, `type`, `name`, `requiresApproval`) ya lo
// rechaza el esquema (`updateResourceSchema` es estricto) y la función del
// repositorio tampoco puede escribirlos.
//
// Las reservas ya creadas **no** se revalidan (criterio 5): el cambio afecta
// solo a la disponibilidad y a las reservas nuevas, que leen el recurso en cada
// solicitud.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Resource, UpdateResourceRequest } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { getResourceById, updateResourceFields } from './repository';

const EDITABLE_FIELDS = ['capacity', 'opensAt', 'closesAt', 'resourceStatus'] as const;

export interface UpdateResourceInput {
  resourceId: string;
  changes: UpdateResourceRequest;
  actor: AuditActor;
  client?: DynamoDBDocumentClient;
  now?: Date;
}

/** Proyecta el ítem de DynamoDB al tipo `Resource` (sin PK/SK/entityType). */
function toResource(item: Resource): Resource {
  return {
    resourceId: item.resourceId,
    type: item.type,
    name: item.name,
    capacity: item.capacity,
    blockMinutes: item.blockMinutes,
    opensAt: item.opensAt,
    closesAt: item.closesAt,
    requiresApproval: item.requiresApproval,
    resourceStatus: item.resourceStatus,
  };
}

export async function updateResource(input: UpdateResourceInput): Promise<Resource> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  const current = await getResourceById(client, input.resourceId);
  if (!current) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso indicado.');
  }

  // Criterio 2: el horario se valida sobre el valor resultante tras mezclar
  // con el actual (p. ej. el cuerpo trae solo `opensAt`). "HH:mm" con ceros a
  // la izquierda ordena lexicográficamente igual que cronológicamente.
  const resultingOpensAt = input.changes.opensAt ?? current.opensAt;
  const resultingClosesAt = input.changes.closesAt ?? current.closesAt;
  if (resultingClosesAt <= resultingOpensAt) {
    throw new AppError('VALIDATION_ERROR', 'closesAt debe ser posterior a opensAt.');
  }

  // Solo los campos que realmente cambian; un PATCH que no cambia nada no
  // escribe ni audita (idempotente).
  const changed: UpdateResourceRequest = {};
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of EDITABLE_FIELDS) {
    const next = input.changes[field];
    if (next !== undefined && next !== current[field]) {
      Object.assign(changed, { [field]: next });
      diff[field] = { from: current[field], to: next };
    }
  }
  if (Object.keys(changed).length === 0) {
    return toResource(current);
  }

  const updated = await updateResourceFields(client, input.resourceId, changed);
  if (!updated) {
    // El recurso dejó de existir entre la lectura y la escritura.
    throw new AppError('NOT_FOUND', 'No se encontró el recurso indicado.');
  }

  await recordAuditLog(client, {
    action: 'RESOURCE_UPDATED',
    actor: input.actor,
    targetType: 'Resource',
    targetId: input.resourceId,
    metadata: { fields: Object.keys(diff), changes: diff },
    now,
  });

  return toResource(updated);
}
