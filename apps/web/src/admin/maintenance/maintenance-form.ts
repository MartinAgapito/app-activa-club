// Formulario de un bloqueo por mantenimiento — US-035 (criterios 1, 2 y 13).
//
// El administrador elige fecha y hora en la hora del club (`America/Lima`);
// se convierten a UTC ISO-8601 para el contrato. La interfaz anticipa que el
// fin sea posterior al inicio; el servidor es la fuente de verdad (400).

import { z } from 'zod';
import type { CreateMaintenanceRequest } from '@activa-club/shared-types';
import { createMaintenanceSchema } from '@activa-club/validation';
import { limaLocalTimeToUtcIso } from '../../lib/format/lima-time';

export const REASON_MAX_LENGTH = 280;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const dateSchema = (message: string) => z.string().regex(DATE_PATTERN, message);
const timeSchema = (message: string) => z.string().regex(TIME_PATTERN, message);

export const maintenanceFormSchema = z
  .object({
    resourceId: z.string().min(1, 'Elige una instalación.'),
    startDate: dateSchema('Elige la fecha de inicio.'),
    startTime: timeSchema('Elige la hora de inicio.'),
    endDate: dateSchema('Elige la fecha de fin.'),
    endTime: timeSchema('Elige la hora de fin.'),
    reason: z
      .string()
      .trim()
      .max(REASON_MAX_LENGTH, `El motivo admite hasta ${REASON_MAX_LENGTH} caracteres.`),
  })
  .superRefine((values, ctx) => {
    // Zod ejecuta este refinamiento aunque algún campo ya sea inválido.
    const complete = [values.startDate, values.endDate].every((value) => DATE_PATTERN.test(value));
    const timesOk = [values.startTime, values.endTime].every((value) => TIME_PATTERN.test(value));
    if (!complete || !timesOk) {
      return;
    }
    const startsAt = limaLocalTimeToUtcIso(values.startDate, values.startTime);
    const endsAt = limaLocalTimeToUtcIso(values.endDate, values.endTime);
    if (endsAt <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El fin debe ser posterior al inicio.',
        path: ['endDate'],
      });
    }
  });

export type MaintenanceFormValues = z.infer<typeof maintenanceFormSchema>;

/** Convierte los valores del formulario (hora de Lima) al cuerpo del
 * contrato (UTC ISO). Devuelve `null` si no cumple el esquema compartido. */
export function buildMaintenanceRequest(
  values: MaintenanceFormValues,
): CreateMaintenanceRequest | null {
  const reason = values.reason.trim();
  const request: CreateMaintenanceRequest = {
    startsAt: limaLocalTimeToUtcIso(values.startDate, values.startTime),
    endsAt: limaLocalTimeToUtcIso(values.endDate, values.endTime),
    ...(reason ? { reason } : {}),
  };
  return createMaintenanceSchema.safeParse(request).success ? request : null;
}

const DATE_FORMAT = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Instante UTC como fecha y hora de Lima, p. ej. "20 jul 2026, 08:00". */
export function formatDateTimeInLima(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}
