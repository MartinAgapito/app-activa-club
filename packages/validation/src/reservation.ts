// Esquemas de validación de recursos y reservas (RN-RES).
// Corresponden a docs/api/contratos-api.md §6-7. Las reglas críticas de aforo,
// cruces y límites se validan además contra el estado en el backend.

import { z } from 'zod';
import { dniSchema, dateOnlySchema, isoDateSchema } from './common';

export const resourceTypeSchema = z.enum([
  'FUTBOL',
  'TENIS',
  'PADEL',
  'PISCINA',
  'PARRILLA',
  'SALON_SOCIAL',
]);

export const resourceStatusSchema = z.enum(['AVAILABLE', 'MAINTENANCE']);

export const reservationStatusSchema = z.enum([
  'CONFIRMED',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

/**
 * Participante de entrada (no incluye al titular, que es el socio autenticado).
 * MEMBER requiere `memberId`; GUEST requiere `dni` y `name`.
 */
export const reservationParticipantInputSchema = z
  .object({
    type: z.enum(['MEMBER', 'GUEST']),
    memberId: z.string().optional(),
    dni: dniSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'MEMBER' && !data.memberId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Un participante socio requiere memberId.',
        path: ['memberId'],
      });
    }
    if (data.type === 'GUEST') {
      if (!data.dni) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Un invitado externo requiere dni.',
          path: ['dni'],
        });
      }
      if (!data.name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Un invitado externo requiere name.',
          path: ['name'],
        });
      }
    }
  });

export const createReservationSchema = z.object({
  resourceId: z.string().trim().min(1),
  startsAt: isoDateSchema,
  participants: z.array(reservationParticipantInputSchema).max(30),
  notes: z.string().trim().max(280).optional(),
});

export const cancelReservationSchema = z.object({}).optional();

export const rejectReservationSchema = z.object({
  reason: z.string().trim().min(3).max(280),
});

export const availabilityQuerySchema = z.object({
  date: dateOnlySchema,
});

// --- Administración de recursos ---

export const updateResourceSchema = z
  .object({
    capacity: z.number().int().positive().optional(),
    opensAt: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    closesAt: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    resourceStatus: resourceStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo a actualizar.',
  });

export const createMaintenanceSchema = z
  .object({
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    reason: z.string().trim().max(280).optional(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: 'endsAt debe ser posterior a startsAt.',
    path: ['endsAt'],
  });

export const listReservationsQuerySchema = z.object({
  scope: z.enum(['me', 'all']).optional(),
  status: reservationStatusSchema.optional(),
  resourceId: z.string().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
