// Esquema de validación del cuerpo del webhook de Stripe (US-024/US-037,
// docs/api/contratos-api.md §5, ADR-0011 §D6/§D8).
//
// Se define aquí (en vez de `packages/validation`, compartido con
// `apps/web`) porque este evento nunca lo produce ni lo consume el frontend:
// es una notificación servidor-a-servidor de Stripe hacia este backend, así
// que no forma parte del contrato de UI/formularios que justifica ese
// paquete compartido.
//
// Forma del evento (`{ type, data: { object } }`), fijada por ADR-0011 §D8 —
// nomenclatura vinculante, no se inventa aquí:
// - `type` se valida como string no vacío (no un enum cerrado): Stripe emite
//   muchos tipos de evento y este esquema debe aceptar cualquiera de ellos
//   para poder responder 202 sin efectos (criterio 9); `./webhook.ts` es
//   quien decide qué tipos disparan un cambio de estado
//   (`payment_intent.succeeded` / `payment_intent.payment_failed`).
// - La correlación con el `Payment` propio de este backend viaja en
//   `data.object.metadata.paymentId` (enviado como `metadata.paymentId` al
//   crear el `PaymentIntent`, `./stripe-client.ts`).
// - `data.object.id` es el `stripePaymentIntentId` del cargo referido.
// - `data.object.last_payment_error.code`/`decline_code` (solo presente en
//   `payment_intent.payment_failed`) se usa para resolver un `failureReason`
//   del catálogo propio; nunca se persiste ni se registra el mensaje crudo
//   del proveedor (RN-PAG-08, criterio 7, ADR-0011 §D9). Este esquema
//   deliberadamente no acepta ni valida ningún campo de tarjeta.
// - `metadata` y `last_payment_error` son **opcionales** en el esquema: para
//   un `type` distinto de los dos relevantes (p. ej. eventos disparados con
//   `stripe trigger` durante la verificación en vivo, criterio 25), el
//   objeto de Stripe puede no tener ningún `metadata.paymentId` — ese evento
//   debe poder pasar la validación y responder 202 sin efectos (criterio 9),
//   no fallar con 400. `./webhook.ts` es quien exige `metadata.paymentId`
//   para los tipos que sí procesa.

import { z } from 'zod';

/** Los dos únicos tipos de evento que disparan un cambio de estado propio (criterio 9, ADR-0011 §D5/§D8). */
export const stripeWebhookEventTypeSchema = z.enum([
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
]);

export const stripeWebhookEventSchema = z.object({
  /** Identificador del evento en Stripe (`evt_...`); solo para trazabilidad en logs, no se usa para decidir nada. */
  id: z.string().trim().min(1).optional(),
  /** String no vacío, no un enum cerrado (ver nota de cabecera): cualquier `type` de Stripe debe pasar la validación. */
  type: z.string().trim().min(1),
  data: z.object({
    object: z
      .object({
        /** `stripePaymentIntentId` del cargo referido por este evento. */
        id: z.string().trim().min(1),
        /** `paymentId` propio de este backend, ver nota de cabecera (ausente en eventos irrelevantes). */
        metadata: z.object({ paymentId: z.string().trim().min(1).optional() }).optional(),
        last_payment_error: z
          .object({
            code: z.string().trim().min(1).optional(),
            decline_code: z.string().trim().min(1).optional(),
          })
          .optional(),
      })
      .passthrough(),
  }),
});

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>;
