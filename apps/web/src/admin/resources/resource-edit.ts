// Formulario de edición de un recurso — US-036 (criterios 1, 2 y 7).
//
// La interfaz anticipa las validaciones para dar feedback inmediato (aforo
// positivo, formato HH:mm, `closesAt > opensAt`); el servidor es la fuente de
// verdad y vuelve a validar (400 `VALIDATION_ERROR`). Solo se envían los
// campos que cambiaron, y solo los cuatro editables.

import { z } from 'zod';
import type { Resource, ResourceStatus, UpdateResourceRequest } from '@activa-club/shared-types';
import { updateResourceSchema } from '@activa-club/validation';

const clubTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:mm.');

export const resourceEditFormSchema = z
  .object({
    capacity: z
      .number({ invalid_type_error: 'Ingresa el aforo como número.' })
      .int('El aforo debe ser un número entero.')
      .positive('El aforo debe ser mayor que cero.'),
    opensAt: clubTimeSchema,
    closesAt: clubTimeSchema,
    resourceStatus: z.enum(['AVAILABLE', 'MAINTENANCE']),
  })
  .refine((values) => values.closesAt > values.opensAt, {
    message: 'La hora de cierre debe ser posterior a la de apertura.',
    path: ['closesAt'],
  });

export interface ResourceEditFormValues {
  capacity: number;
  opensAt: string;
  closesAt: string;
  resourceStatus: ResourceStatus;
}

export function toFormValues(resource: Resource): ResourceEditFormValues {
  return {
    capacity: resource.capacity,
    opensAt: resource.opensAt,
    closesAt: resource.closesAt,
    resourceStatus: resource.resourceStatus,
  };
}

/** Solo los campos que cambiaron respecto del recurso actual. Vacío si no hay
 * cambios. */
export function buildResourceUpdate(
  resource: Resource,
  values: ResourceEditFormValues,
): UpdateResourceRequest {
  const request: UpdateResourceRequest = {};
  if (values.capacity !== resource.capacity) {
    request.capacity = values.capacity;
  }
  if (values.opensAt !== resource.opensAt) {
    request.opensAt = values.opensAt;
  }
  if (values.closesAt !== resource.closesAt) {
    request.closesAt = values.closesAt;
  }
  if (values.resourceStatus !== resource.resourceStatus) {
    request.resourceStatus = values.resourceStatus;
  }
  return request;
}

/** `true` si el cuerpo cumple el esquema estricto del contrato. */
export function isValidResourceUpdate(request: unknown): boolean {
  return updateResourceSchema.safeParse(request).success;
}

export interface ResourceChangeLine {
  label: string;
  from: string;
  to: string;
}

const STATUS_TEXT: Record<ResourceStatus, string> = {
  AVAILABLE: 'Disponible',
  MAINTENANCE: 'En mantenimiento',
};

/** Líneas "campo: antes -> después" para el diálogo de confirmación. */
export function describeChanges(
  resource: Resource,
  request: UpdateResourceRequest,
): ResourceChangeLine[] {
  const lines: ResourceChangeLine[] = [];
  if (request.capacity !== undefined) {
    lines.push({
      label: 'Aforo',
      from: `${resource.capacity} personas`,
      to: `${request.capacity} personas`,
    });
  }
  if (request.opensAt !== undefined) {
    lines.push({ label: 'Apertura', from: resource.opensAt, to: request.opensAt });
  }
  if (request.closesAt !== undefined) {
    lines.push({ label: 'Cierre', from: resource.closesAt, to: request.closesAt });
  }
  if (request.resourceStatus !== undefined) {
    lines.push({
      label: 'Estado',
      from: STATUS_TEXT[resource.resourceStatus],
      to: STATUS_TEXT[request.resourceStatus],
    });
  }
  return lines;
}

export interface ChangeNotes {
  /** Bajar el aforo o cambiar el horario: no invalida reservas ya creadas. */
  existingReservationsKept: boolean;
  /** Poner en mantenimiento: bloqueo indefinido. */
  indefiniteMaintenance: boolean;
}

export function describeChangeNotes(
  resource: Resource,
  request: UpdateResourceRequest,
): ChangeNotes {
  return {
    existingReservationsKept:
      (request.capacity !== undefined && request.capacity < resource.capacity) ||
      request.opensAt !== undefined ||
      request.closesAt !== undefined,
    indefiniteMaintenance: request.resourceStatus === 'MAINTENANCE',
  };
}
