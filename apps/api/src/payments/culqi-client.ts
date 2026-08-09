// Interfaz del cliente de cargos de Culqi sandbox (ADR-0007, RN-PAG-04/08).
//
// Define la forma que debe tener la función que hace el cargo real
// server-side, para que `./charge.ts` pueda inyectarla (mockeable en tests,
// intercambiable sin tocar la lógica de dominio). **No implementa todavía la
// llamada HTTP real a Culqi** (endpoint `/v2/charges` con la llave privada):
// esa integración llega en una historia de backend posterior, cuando exista
// la cuenta de Culqi sandbox real (hoy el secreto de US-019 es un valor
// placeholder). Mientras tanto se expone `notImplementedCulqiClient`, un stub
// que falla explícitamente en vez de simular un resultado — así ningún
// ambiente activa membresías con datos de pago inventados si este stub
// llegara a invocarse antes de reemplazarlo por el cliente real.

import type { Currency } from '@activa-club/shared-types';

import { AppError } from '../lib/errors';

export interface CulqiChargeInput {
  /** Token generado por Culqi.js en el cliente (RN-PAG-08: nunca PAN/CVV). */
  culqiToken: string;
  /** Monto en céntimos, resuelto por el backend (`./plans.ts`), nunca por el cliente. */
  amount: number;
  currency: Currency;
  /** Referencia opaca para trazabilidad en Culqi/logs (usamos `paymentId`, nunca datos de tarjeta). */
  reference: string;
}

export type CulqiChargeOutcome =
  | { outcome: 'APPROVED'; culqiChargeId: string }
  | { outcome: 'DECLINED'; reason: string }
  /** Respuesta ambigua o perdida (timeout, error de red, etc.): el pago debe quedar `PENDING_CONFIRMATION` (criterio 5). */
  | { outcome: 'AMBIGUOUS' };

/** Firma inyectable del cliente de cargos, para que `./charge.ts` no dependa de una implementación concreta. */
export type CulqiChargeClient = (input: CulqiChargeInput) => Promise<CulqiChargeOutcome>;

/**
 * Stub temporal (placeholder): lanza en vez de cobrar. Reemplazar por la
 * llamada HTTP real a Culqi sandbox (llave privada leída de US-019) en la
 * historia de backend que la implemente; hasta entonces, `POST /payments`
 * responde `INTERNAL_ERROR` (500) de forma explícita en vez de fingir un
 * cargo exitoso o fallido.
 */
export const notImplementedCulqiClient: CulqiChargeClient = async () => {
  throw new AppError(
    'INTERNAL_ERROR',
    'La integración con Culqi sandbox todavía no está implementada.',
  );
};
