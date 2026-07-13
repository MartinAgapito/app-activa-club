// Esquemas de validación de socios, activación y registro (RN-ACT / RN-ADM).
// Corresponden a los DTOs de @activa-club/shared-types y a docs/api/contratos-api.md §3-4.

import { z } from 'zod';
import { dniSchema, emailSchema, passwordSchema, phoneSchema } from './common';

export const memberOriginSchema = z.enum(['MIGRATED', 'NEW']);

export const memberStatusSchema = z.enum(['MIGRATED', 'PENDING', 'APPROVED', 'REJECTED', 'ACTIVE']);

export const membershipTypeSchema = z.enum(['MONTHLY', 'ANNUAL']);

export const membershipStatusSchema = z.enum([
  'ACTIVE',
  'EXPIRING_SOON',
  'EXPIRED',
  'DEBT',
  'NONE',
]);

// --- Activación ---

export const verifyDniSchema = z.object({
  dni: dniSchema,
});

export const completeActivationSchema = z.object({
  dni: dniSchema,
  email: emailSchema,
  password: passwordSchema,
});

// --- Registro ---

export const registrationSchema = z.object({
  dni: dniSchema,
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: phoneSchema.optional(),
});

// --- Gestión de socios ---

export const updateMemberSchema = z
  .object({
    phone: phoneSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo a actualizar.',
  });

export const autoRenewSchema = z.object({
  enabled: z.boolean(),
});

export const rejectMemberSchema = z.object({
  reason: z.string().trim().min(3).max(280),
});

export const listMembersQuerySchema = z.object({
  status: memberStatusSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
