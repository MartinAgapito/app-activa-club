// Esquema de validación del formulario de edición de perfil — US-018.
//
// El único campo editable del contrato (`PATCH /members/me`,
// docs/api/contratos-api.md §4) es `phone`. Reutiliza `phoneSchema` de
// `@activa-club/validation` (misma regla que revalida el backend, fuente de
// verdad) en vez de `.optional()` como en el registro (US-016): en esta
// pantalla el campo siempre se envía, así que debe tener un valor válido
// antes de habilitar el guardado.

import { z } from 'zod';
import { phoneSchema } from '@activa-club/validation';

export const profileContactFormSchema = z.object({
  phone: phoneSchema,
});

export type ProfileContactFormValues = z.infer<typeof profileContactFormSchema>;
