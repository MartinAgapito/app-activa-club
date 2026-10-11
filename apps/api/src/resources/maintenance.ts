// Orquestadores de bloqueo/liberación por mantenimiento (US-035, criterios
// 1-12, RN-RES-11, docs/api/contratos-api.md §6).
//
// El bloqueo **no cancela** reservas existentes (criterio 10): solo informa
// cuántas reservas activas caen en la ventana (`affectedReservationCount`) y
// deja el rastro de auditoría `RESOURCE_MAINTENANCE` que EP-05 usará para
// notificar a los socios afectados (criterio 12).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { CreateMaintenanceResponse } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findResourceOccupancy } from '../reservations/repository';
import {
  deleteMaintenanceBlock,
  findMaintenanceBlock,
  putMaintenanceBlock,
} from './maintenance-repository';
import { getResourceById } from './repository';

export interface CreateMaintenanceInput {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  reason?: string | undefined;
  actor: AuditActor;
  client?: DynamoDBDocumentClient;
  now?: Date;
  /** `blockId` inyectable para pruebas deterministas. */
  blockId?: string;
}

export async function createMaintenanceBlock(
  input: CreateMaintenanceInput,
): Promise<CreateMaintenanceResponse> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  const resource = await getResourceById(client, input.resourceId);
  if (!resource) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso indicado.');
  }

  // Se normaliza a UTC para que la SK/GSI3SK ordenen lexicográficamente igual
  // que las reservas (siempre `toISOString()`), aunque llegue con offset.
  const startsAt = new Date(input.startsAt).toISOString();
  const endsAt = new Date(input.endsAt).toISOString();
  if (endsAt <= startsAt) {
    throw new AppError('VALIDATION_ERROR', 'endsAt debe ser posterior a startsAt.');
  }

  const { activeReservations } = await findResourceOccupancy(client, input.resourceId, {
    from: startsAt,
    to: endsAt,
  });

  const block = {
    blockId: input.blockId ?? ulid(),
    resourceId: input.resourceId,
    startsAt,
    endsAt,
    reason: input.reason ? input.reason : null,
    createdBy: input.actor.actorId,
    createdAt: now,
  };
  await putMaintenanceBlock(client, block);

  await recordAuditLog(client, {
    action: 'RESOURCE_MAINTENANCE',
    actor: input.actor,
    targetType: 'MaintenanceBlock',
    targetId: block.blockId,
    metadata: {
      operation: 'CREATED',
      resourceId: block.resourceId,
      startsAt,
      endsAt,
      reason: block.reason,
      affectedReservationCount: activeReservations.length,
    },
    now,
  });

  return {
    blockId: block.blockId,
    resourceId: block.resourceId,
    startsAt,
    endsAt,
    reason: block.reason,
    affectedReservationCount: activeReservations.length,
  };
}

export interface ReleaseMaintenanceInput {
  resourceId: string;
  blockId: string;
  actor: AuditActor;
  client?: DynamoDBDocumentClient;
  now?: Date;
}

export async function releaseMaintenanceBlock(input: ReleaseMaintenanceInput): Promise<void> {
  const client = input.client ?? getDocumentClient();
  const now = (input.now ?? new Date()).toISOString();

  const block = await findMaintenanceBlock(client, input.resourceId, input.blockId);
  if (!block) {
    throw new AppError('NOT_FOUND', 'No se encontró el bloqueo indicado.');
  }

  const deleted = await deleteMaintenanceBlock(client, block);
  if (!deleted) {
    // Otra liberación concurrente ganó la carrera (criterio 7).
    throw new AppError('NOT_FOUND', 'No se encontró el bloqueo indicado.');
  }

  await recordAuditLog(client, {
    action: 'RESOURCE_MAINTENANCE',
    actor: input.actor,
    targetType: 'MaintenanceBlock',
    targetId: block.blockId,
    metadata: {
      operation: 'RELEASED',
      resourceId: block.resourceId,
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      reason: block.reason,
    },
    now,
  });
}
