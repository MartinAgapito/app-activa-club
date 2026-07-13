// Esquema de referencia para el patrón React Hook Form + Zod (US-008).
// Deliberadamente genérico y sin relación con ninguna entidad de negocio real
// (no reutiliza packages/validation): es solo la demostración del patrón que
// las historias de Sprint 1 seguirán con sus propios esquemas ya existentes
// en packages/validation.

import { z } from 'zod';

export const referenceFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Ingresa al menos 2 caracteres.').max(80),
  email: z.string().trim().toLowerCase().email('Ingresa un correo válido.'),
  message: z.string().trim().min(10, 'Cuéntanos un poco más (mínimo 10 caracteres).').max(500),
});

export type ReferenceFormValues = z.infer<typeof referenceFormSchema>;
