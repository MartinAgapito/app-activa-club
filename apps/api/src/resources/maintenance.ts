// Orquestadores de bloqueo/liberación por mantenimiento (US-035, criterios
// 1-12, RN-RES-11, docs/api/contratos-api.md §6).
//
// El bloqueo **no cancela** reservas existentes (criterio 10): solo informa
// cuántas reservas activas caen en la ventana (`affectedReservationCount`) y
// deja el rastro de auditoría `RESOURCE_MAINTENANCE` que EP-05 usará para
// notificar a los socios afectados (criterio 12).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import type { CreateMaintenanceResponse, ListMaintenanceResponse } from '@activa-club/shared-types';

import { recordAuditLog, type AuditActor } from '../lib/audit';
import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { intervalsOverlap } from '../reservations/overlap';
import { findResourceOccupancy } from '../reservations/repository';
import {
  deleteMaintenanceBlock,
  findMaintenanceBlock,
  listMaintenanceBlocks as queryMaintenanceBlocks,
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

export interface ListMaintenanceInput {
  resourceId: string;
  /** Inicio de la ventana de consulta (ISO-8601, admite offset). */
  from?: string | undefined;
  /** Fin de la ventana de consulta (ISO-8601, admite offset). */
  to?: string | undefined;
  client?: DynamoDBDocumentClient;
  now?: Date;
}

// Extremos representables de `Date`, para ventanas abiertas (solo `from` o solo `to`).
const MIN_DATE = new Date(-8.64e15);
const MAX_DATE = new Date(8.64e15);

/**
 * Lista los bloqueos de un recurso (US-035, criterio 13), ordenados por
 * `startsAt` ascendente. Sin `from`/`to` devuelve los vigentes y futuros
 * (`endsAt` posterior a ahora); con alguno de los dos, los que se solapan con
 * la ventana `[from, to)`, incluidos bloqueos ya vencidos.
 */
export async function listMaintenanceBlocks(
  input: ListMaintenanceInput,
): Promise<ListMaintenanceResponse> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();

  if (input.from && input.to && new Date(input.from) >= new Date(input.to)) {
    throw new AppError('VALIDATION_ERROR', 'from debe ser anterior a to.');
  }

  const resource = await getResourceById(client, input.resourceId);
  if (!resource) {
    throw new AppError('NOT_FOUND', 'No se encontró el recurso indicado.');
  }

  const blocks = await queryMaintenanceBlocks(client, input.resourceId);
  const hasWindow = input.from !== undefined || input.to !== undefined;
  const windowStart = input.from ? new Date(input.from) : MIN_DATE;
  const windowEnd = input.to ? new Date(input.to) : MAX_DATE;

  const items = blocks
    .filter((block) =>
      hasWindow
        ? intervalsOverlap(block.startsAt, block.endsAt, windowStart, windowEnd)
        : new Date(block.endsAt) > now,
    )
    .sort((a, b) =>
      a.startsAt === b.startsAt
        ? a.blockId.localeCompare(b.blockId)
        : a.startsAt < b.startsAt
          ? -1
          : 1,
    );

  return { items };
}
