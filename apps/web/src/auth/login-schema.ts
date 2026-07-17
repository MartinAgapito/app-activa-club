// Esquema de validación del formulario de login — US-014.
//
// Esquema local (no `@activa-club/validation`, ver reference-form-schema.ts
// para el mismo patrón): el login no tiene un DTO de backend propio (va
// directo contra Cognito), y así se define el mensaje de error de correo en
// español sin alterar `emailSchema`, compartida por otros formularios. La
// contraseña solo se valida como "requerida" en cliente: la política de
// complejidad la aplica y es fuente de verdad Cognito (ADR-0002); exigir aquí
// una política propia podría rechazar intentos de login válidos.

import { z } from 'zod';

export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresa un correo electrónico válido.'),
  password: z.string().min(1, 'Ingresa tu contraseña.'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
