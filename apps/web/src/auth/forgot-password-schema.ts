// Esquemas de validación del flujo de recuperación de contraseña — US-015.
//
// Esquemas locales (mismo criterio que login-schema.ts): la recuperación va
// directa contra Cognito, sin DTO de backend propio. El código de
// verificación solo se valida como "requerido" en cliente — es Cognito quien
// determina si es válido o si venció (criterio de aceptación 4). La nueva
// contraseña replica en el cliente la política configurada en el User Pool
// (longitud mínima, mayúscula, minúscula y número — ver
// infrastructure/terraform/modules/cognito-user-pool/main.tf) únicamente
// para dar retroalimentación inmediata (criterio de aceptación 5); Cognito
// sigue siendo la fuente de verdad y puede rechazar la contraseña igual si
// la política cambia.

import { z } from 'zod';

/** Longitud mínima configurada en el User Pool
 * (`password_minimum_length`, por defecto 8). */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_REQUIREMENTS = [
  `Al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  'Al menos una letra minúscula.',
  'Al menos una letra mayúscula.',
  'Al menos un número.',
] as const;

const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/[0-9]/, 'Debe incluir al menos un número.');

export const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresa un correo electrónico válido.'),
});

export type RequestPasswordResetValues = z.infer<typeof requestPasswordResetSchema>;

export const confirmPasswordResetSchema = z.object({
  code: z.string().trim().min(1, 'Ingresa el código que recibiste por correo.'),
  newPassword: newPasswordSchema,
});

export type ConfirmPasswordResetValues = z.infer<typeof confirmPasswordResetSchema>;
