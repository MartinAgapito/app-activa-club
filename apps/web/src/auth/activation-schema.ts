// Esquemas de validación del flujo de activación de cuenta con DNI — US-013.
//
// Igual que register-schema.ts, este flujo sí tiene contrato de backend
// documentado (`POST /activation/verify` y `POST /activation/complete`,
// docs/api/contratos-api.md §3, RN-ACT-01/02/03). El paso 1 solo valida el
// DNI (identifica al socio migrado, RN-ACT-02); reutiliza `dniSchema` de
// `@activa-club/validation`, la misma regla que revalida el backend. El paso
// 2 define correo y contraseña de la cuenta Cognito que se crea: la
// contraseña replica en el cliente la misma política que
// forgot-password-schema.ts / register-schema.ts (PASSWORD_REQUIREMENTS),
// solo para dar retroalimentación inmediata — Cognito/el backend siguen
// siendo la fuente de verdad.

import { z } from 'zod';
import { dniSchema } from '@activa-club/validation';
import { PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from './forgot-password-schema';

export { PASSWORD_REQUIREMENTS };

export const verifyDniFormSchema = z.object({
  dni: dniSchema,
});

export type VerifyDniFormValues = z.infer<typeof verifyDniFormSchema>;

const passwordFormSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula.')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula.')
  .regex(/[0-9]/, 'Debe incluir al menos un número.');

export const completeActivationFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresa un correo electrónico válido.'),
  password: passwordFormSchema,
});

export type CompleteActivationFormValues = z.infer<typeof completeActivationFormSchema>;
