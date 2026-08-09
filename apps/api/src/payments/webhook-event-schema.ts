// Esquema de validación del cuerpo del webhook de Culqi (US-024,
// docs/api/contratos-api.md §5, ADR-0007).
//
// Se define aquí (en vez de `packages/validation`, compartido con
// `apps/web`) porque este evento nunca lo produce ni lo consume el frontend:
// es una notificación servidor-a-servidor de Culqi hacia este backend, así
// que no forma parte del contrato de UI/formularios que justifica ese
// paquete compartido.
//
// FORMA ASUMIDA (sin cuenta Culqi sandbox real todavía, ver US-024
// precondiciones): un envoltorio `{ type, data: { object } }`, patrón
// estándar de eventos de webhooks de pago (Stripe/Culqi lo usan). La
// correlación con el `Payment` propio de este backend viaja en
// `data.object.metadata.reference`: al crear el cargo (ADR-0007,
// `./culqi-client.ts`, campo `reference`) este backend envía su `paymentId`
// como referencia; se asume que Culqi la refleja tal cual en el evento del
// webhook bajo `metadata.reference` (Culqi documenta soporte de `metadata`
// arbitraria en la creación de cargos).
//
// A CONFIRMAR contra la documentación real de Culqi cuando exista la cuenta
// sandbox:
// - Los valores exactos de `type` (aquí `charge.succeeded`/`charge.failed`).
// - Si el campo de correlación realmente viaja en
//   `data.object.metadata.reference` o en otro lugar del evento.
// - El campo exacto del motivo de un cargo fallido (aquí se asume
//   `data.object.outcome.user_message`; nunca datos de tarjeta/CVV,
//   RN-PAG-08 — este esquema deliberadamente no acepta ni valida ningún
//   campo de tarjeta).

import { z } from 'zod';

export const culqiWebhookEventTypeSchema = z.enum(['charge.succeeded', 'charge.failed']);

export const culqiWebhookEventSchema = z.object({
  /** Identificador del evento en Culqi; solo para trazabilidad en logs, no se usa para decidir nada. */
  id: z.string().trim().min(1).optional(),
  type: culqiWebhookEventTypeSchema,
  data: z.object({
    object: z.object({
      /** `culqiChargeId` del cargo referido por este evento. */
      id: z.string().trim().min(1),
      metadata: z.object({
        /** `paymentId` propio de este backend (ver nota de cabecera). */
        reference: z.string().trim().min(1),
      }),
      outcome: z
        .object({
          type: z.string().trim().min(1).optional(),
          user_message: z.string().trim().min(1).optional(),
        })
        .optional(),
    }),
  }),
});

export type CulqiWebhookEvent = z.infer<typeof culqiWebhookEventSchema>;
