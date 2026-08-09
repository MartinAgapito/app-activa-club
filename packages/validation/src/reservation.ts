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
 * MEMBER requiere `memberId` (obtenido con `GET /members/lookup?dni=`); GUEST
 * requiere `dni`, `firstName` y `lastName`.
 *
 * El nombre del invitado se envía siempre, exista o no su `GuestProfile`: si ya
 * existe, el servidor conserva el nombre registrado y descarta el enviado
 * (ADR-0009), así que el cliente no necesita saber cuál de los dos casos aplica
 * para armar la petición.
 */
export const reservationParticipantInputSchema = z
  .object({
    type: z.enum(['MEMBER', 'GUEST']),
    memberId: z.string().optional(),
    dni: dniSchema.optional(),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
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
      if (!data.firstName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Un invitado externo requiere firstName.',
          path: ['firstName'],
        });
      }
      if (!data.lastName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Un invitado externo requiere lastName.',
          path: ['lastName'],
        });
      }
    }
  });

/**
 * Query de `GET /guests/lookup?dni=` (RN-RES-03/04, ADR-0009): coincidencia
 * exacta de DNI. Un 404 significa "todavía no fue invitado nunca", no un error.
 */
export const guestLookupQuerySchema = z.object({
  dni: dniSchema,
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
