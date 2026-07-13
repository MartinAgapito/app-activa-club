// Esquemas de validación del JSON on-premise de migración (RN-MIG).
// Alineado con docs/data/mapeo-migracion.md §1 (contrato de entrada) y los
// DTOs de @activa-club/shared-types (`LegacyMember`, `LegacyExport`).

import { z } from 'zod';
import {
  amountSchema,
  dateOnlySchema,
  dniSchema,
  emailSchema,
  isoDateSchema,
  phoneSchema,
} from './common';
import { membershipTypeSchema } from './member';

export const legacyMembershipSchema = z.object({
  tipo: membershipTypeSchema,
  inicio: dateOnlySchema,
  fin: dateOnlySchema,
  estadoLegado: z.string().trim().min(1),
});

export const legacyMemberSchema = z.object({
  legacyId: z.string().trim().min(1),
  dni: dniSchema,
  nombres: z.string().trim().min(1).max(120),
  apellidos: z.string().trim().min(1).max(120),
  email: emailSchema,
  telefono: phoneSchema.optional(),
  membresia: legacyMembershipSchema,
  /** Saldo pendiente en céntimos (0 si no debe). */
  saldoPendiente: amountSchema,
});

export const legacyExportSchema = z.object({
  version: z.string().trim().min(1),
  exportedAt: isoDateSchema,
  socios: z.array(legacyMemberSchema),
});

/**
 * Valida solo la "envoltura" del JSON on-premise (version/exportedAt/socios como
 * arreglo), sin exigir que cada socio sea válido. El flujo de migración valida
 * cada socio individualmente con `legacyMemberSchema` para poder rechazar
 * registros puntuales sin abortar el lote completo (docs/data/mapeo-migracion.md §4).
 */
export const legacyExportEnvelopeSchema = z.object({
  version: z.string().trim().min(1),
  exportedAt: isoDateSchema,
  socios: z.array(z.unknown()),
});
