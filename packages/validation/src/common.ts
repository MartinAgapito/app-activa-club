// Primitivos y enums de validación compartidos (Zod).
// Reflejan las convenciones de docs/api/contratos-api.md y el diccionario de datos.

import { z } from 'zod';

/** DNI peruano: 8 dígitos. */
export const dniSchema = z
  .string()
  .trim()
  .regex(/^\d{8}$/, 'El DNI debe tener 8 dígitos.');

/** Correo electrónico. */
export const emailSchema = z.string().trim().toLowerCase().email();

/** Contraseña mínima para Cognito (política reforzada en el User Pool). */
export const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres.')
  .max(128);

/** Teléfono opcional (7 a 15 dígitos). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\d{7,15}$/, 'Teléfono inválido.');

/** Fecha/hora ISO-8601. */
export const isoDateSchema = z.string().datetime({ offset: true });

/** Fecha simple YYYY-MM-DD (para consultas de disponibilidad). */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado YYYY-MM-DD.');

export const roleSchema = z.enum(['member', 'admin']);
export const currencySchema = z.enum(['PEN']);

/** Monto en céntimos: entero positivo. */
export const amountSchema = z.number().int().nonnegative();

/** Parámetros de paginación por cursor. */
export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
