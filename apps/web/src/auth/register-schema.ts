// Esquema de validación del formulario de registro de socio nuevo — US-016.
//
// A diferencia de login-schema.ts y forgot-password-schema.ts (flujos que van
// directo contra Cognito, sin DTO de backend propio), el registro sí tiene un
// contrato de backend documentado (`POST /registration`,
// docs/api/contratos-api.md §3, `RegistrationRequest` de
// `@activa-club/shared-types` y `registrationSchema` de
// `@activa-club/validation`). Por eso el DNI y el teléfono reutilizan aquí los
// primitivos de `@activa-club/validation` (misma regla que revalida el
// backend, fuente de verdad); el correo se redefine localmente con un mensaje
// en español, igual que en login-schema.ts, para no alterar `emailSchema`
// compartida por otros formularios. La contraseña replica en el cliente la
// política de complejidad del User Pool de Cognito (mismos requisitos que
// PASSWORD_REQUIREMENTS de forgot-password-schema.ts): el registro crea
// directamente la cuenta Cognito del socio con la contraseña elegida (no una
// temporal), por lo que aplica la misma política, solo para dar
// retroalimentación inmediata — Cognito/el backend siguen siendo la fuente de
// verdad y pueden rechazarla igual si la política cambia.

import { z } from 'zod';
import { dniSchema, phoneSchema } from '@activa-club/validation';
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from './forgot-password-schema';

export { PASSWORD_REQUIREMENTS };

const passwordFormSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/[0-9]/, 'Debe incluir al menos un número.');

/** El teléfono es opcional (RegistrationRequest.phone?), pero si se ingresa
 * debe respetar el mismo formato que valida el backend (`phoneSchema`). Un
 * campo vacío se normaliza a `undefined` para no enviarlo en el body. */
const phoneFormSchema = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || phoneSchema.safeParse(value).success, 'Teléfono inválido.')
  .transform((value) => (value ? value : undefined));

export const registerFormSchema = z.object({
  dni: dniSchema,
  email: z.string().trim().toLowerCase().email('Ingresa un correo electrónico válido.'),
  password: passwordFormSchema,
  firstName: z.string().trim().min(1, 'Ingresa tus nombres.').max(80, 'Máximo 80 caracteres.'),
  lastName: z.string().trim().min(1, 'Ingresa tus apellidos.').max(80, 'Máximo 80 caracteres.'),
  phone: phoneFormSchema,
});

export type RegisterFormValues = z.infer<typeof registerFormSchema>;
