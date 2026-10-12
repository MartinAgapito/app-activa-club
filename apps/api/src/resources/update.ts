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
import { logger } from '../lib/logger';
import { findResourceOccupancy } from '../reservations/repository';
import { notifyAffectedReservations } from './maintenance-notify';
import { getResourceById, updateResourceFields } from './repository';

/** Fin de ventana "abierta": toda reserva futura del recurso (bloqueo indefinido). */
const FAR_FUTURE = '9999-12-31T23:59:59.999Z';

const EDITABLE_FIELDS = ['capacity', 'opensAt', 'closesAt', 'resourceStatus'] as const;

export interface UpdateResourceInput {
  resourceId: string;
  changes: UpdateResourceRequest;
  actor: AuditActor;
  client?: DynamoDBDocumentClient;
  now?: Date;
  /** Correlación con la solicitud HTTP (logs de los avisos). */
  requestId?: string;
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

  // US-045 (criterio 2): al entrar en MAINTENANCE (bloqueo indefinido) se
  // avisa a los titulares de las reservas activas futuras. Solo en la
  // transición; volver a AVAILABLE u otros cambios no avisan (criterio 7).
  if (changed.resourceStatus === 'MAINTENANCE') {
    await notifyFutureReservations(client, updated, now, input.requestId);
  }

  return toResource(updated);
}

/** Nunca lanza: la actualización ya está aplicada y auditada. */
async function notifyFutureReservations(
  client: DynamoDBDocumentClient,
  resource: Resource,
  now: string,
  requestId: string | undefined,
): Promise<void> {
  try {
    const { activeReservations } = await findResourceOccupancy(client, resource.resourceId, {
      from: now,
      to: FAR_FUTURE,
    });
    await notifyAffectedReservations({
      client,
      resourceName: resource.name,
      reservations: activeReservations,
      factId: 'status-maintenance',
      requestId,
      now,
    });
  } catch (error) {
    logger.error('No se pudo consultar las reservas futuras para avisar del mantenimiento', {
      requestId: requestId ?? 'resource-update',
      entityType: 'MaintenanceNotification',
      action: 'MAINTENANCE_NOTIFY',
      outcome: 'FAILURE',
      reason: error instanceof Error ? error.name : 'UnknownError',
    });
  }
}
