// Cliente de cargos de Stripe test mode (ADR-0011, RN-PAG-04/08). Antes:
// Culqi sandbox (ADR-0007, este módulo se llamaba `culqi-client.ts` y
// exponía un stub `notImplementedCulqiClient` sin integración real). Ahora:
// Stripe, con el SDK oficial `stripe` (ver ADR-0011).
//
// Define la forma que debe tener la función que hace el cargo real
// server-side, para que `./charge.ts` pueda inyectarla (mockeable en tests,
// intercambiable sin tocar la lógica de dominio), y la implementación real
// (`createStripeChargeClient`) que crea el `PaymentIntent` exactamente como
// especifica ADR-0011 §D3.

import Stripe from 'stripe';
import type { Currency } from '@activa-club/shared-types';

import { getStripeSecretKey } from './stripe-secret-key';

export interface StripeChargeInput {
  /** `pm_...` creado por Stripe.js en el cliente (RN-PAG-08: nunca PAN/CVV). */
  stripePaymentMethodId: string;
  /** Monto en céntimos, resuelto por el backend (`./plans.ts`), nunca por el cliente. */
  amount: number;
  currency: Currency;
  /** `paymentId` propio; viaja como `metadata.paymentId` del PaymentIntent (ADR-0011 §D3). */
  reference: string;
  /** Se envía como `Idempotency-Key` nativo de Stripe (ADR-0011 §D4). */
  idempotencyKey: string;
}

export type StripeChargeOutcome =
  | { outcome: 'APPROVED'; stripePaymentIntentId: string }
  | { outcome: 'DECLINED'; reason: string }
  /** Respuesta ambigua o perdida (timeout, error de red, etc.): el pago debe quedar `PENDING_CONFIRMATION` (criterio 5). */
  | { outcome: 'AMBIGUOUS' };

/** Firma inyectable del cliente de cargos, para que `./charge.ts` no dependa de una implementación concreta. */
export type StripeChargeClient = (input: StripeChargeInput) => Promise<StripeChargeOutcome>;

let stripeClientSingleton: Stripe | undefined;

function getStripeClient(secretKey: string): Stripe {
  stripeClientSingleton ??= new Stripe(secretKey);
  return stripeClientSingleton;
}

/** Solo para pruebas: limpia el cliente Stripe cacheado entre casos (evita fugas de estado entre tests). */
export function resetStripeClientForTests(): void {
  stripeClientSingleton = undefined;
}

/**
 * Catálogo propio de `failureReason` (ADR-0011 §D9, criterio 7): nunca se
 * propaga el mensaje crudo del proveedor al socio ni a los logs. Mapea por
 * `error.code`/`decline_code` de Stripe; un código no catalogado cae en un
 * mensaje genérico.
 */
const DECLINE_REASON_CATALOG: Record<string, string> = {
  card_declined: 'Tarjeta rechazada por el emisor.',
  generic_decline: 'Tarjeta rechazada por el emisor.',
  insufficient_funds: 'Fondos insuficientes.',
  expired_card: 'La tarjeta está vencida.',
  incorrect_cvc: 'El código de seguridad (CVC) es incorrecto.',
  incorrect_number: 'El número de tarjeta es incorrecto.',
  processing_error: 'Error al procesar la tarjeta. Intente nuevamente.',
  lost_card: 'Tarjeta rechazada por el emisor.',
  stolen_card: 'Tarjeta rechazada por el emisor.',
};

const DEFAULT_DECLINE_REASON = 'Pago rechazado.';

/** Resuelve un `failureReason` propio a partir del código de Stripe, nunca el mensaje crudo del proveedor. */
function resolveDeclineReason(code: string | undefined | null): string {
  if (!code) return DEFAULT_DECLINE_REASON;
  return DECLINE_REASON_CATALOG[code] ?? DEFAULT_DECLINE_REASON;
}

/**
 * Primer valor no vacío de la lista (a diferencia de `??`, también descarta
 * cadenas vacías): `StripeCardError.decline_code` es `string` no opcional en
 * el tipado del SDK pero puede llegar como `''` en tiempo de ejecución
 * cuando Stripe no lo informa (`node_modules/stripe/cjs/Error.js`), lo que
 * rompería una cadena de `??` dejándola "atascada" en el primer valor.
 */
function firstNonEmpty(...values: (string | undefined | null)[]): string | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Traduce el estado síncrono de un `PaymentIntent` recién creado (con
 * `confirm: true`) al `StripeChargeOutcome` interno, según la tabla de
 * ADR-0011 §D5.
 */
function outcomeFromPaymentIntentStatus(intent: Stripe.PaymentIntent): StripeChargeOutcome {
  switch (intent.status) {
    case 'succeeded':
      return { outcome: 'APPROVED', stripePaymentIntentId: intent.id };
    case 'processing':
    case 'requires_action':
    case 'requires_confirmation':
    case 'requires_capture':
      return { outcome: 'AMBIGUOUS' };
    case 'requires_payment_method':
    case 'canceled':
      return {
        outcome: 'DECLINED',
        reason: resolveDeclineReason(intent.last_payment_error?.code),
      };
    default:
      // Estado no contemplado por ADR-0011 §D5 (SDK futuro): se trata como
      // ambiguo, nunca se activa una membresía sin confirmación segura.
      return { outcome: 'AMBIGUOUS' };
  }
}

/**
 * Crea el cliente de cargos real contra Stripe test mode (ADR-0011 §D2/§D3):
 * usa el SDK oficial `stripe`, nunca `fetch` manual. `secretKey` (`sk_test_`)
 * la resuelve el llamante (`./stripe-secret-key.ts`, leída de SSM en tiempo
 * de ejecución), nunca hardcodeada.
 */
export function createStripeChargeClient(secretKey: string): StripeChargeClient {
  const stripe = getStripeClient(secretKey);

  return async (input) => {
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amount,
          currency: input.currency.toLowerCase(),
          payment_method: input.stripePaymentMethodId,
          confirm: true,
          // Evita métodos con redirección: el MVP no implementa retorno 3DS/SCA.
          automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          metadata: { paymentId: input.reference },
          description: `Membresía — Activa Club`,
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return outcomeFromPaymentIntentStatus(intent);
    } catch (error) {
      // ADR-0011 §D5: con `confirm: true`, una tarjeta rechazada no devuelve
      // un PaymentIntent con estado de fallo, el SDK **lanza**
      // `StripeCardError`. Se detecta por `error.type` (no por `instanceof`,
      // más robusto ante múltiples instancias del paquete) y se mapea a
      // `DECLINED` usando el estado real del PaymentIntent embebido en el
      // error, o el código de rechazo si no viene el intent.
      if (isStripeCardError(error)) {
        return {
          outcome: 'DECLINED',
          reason: resolveDeclineReason(
            firstNonEmpty(
              error.decline_code,
              error.code,
              error.payment_intent?.last_payment_error?.decline_code,
              error.payment_intent?.last_payment_error?.code,
            ),
          ),
        };
      }
      // Cualquier otra excepción (red, timeout, error de Stripe no
      // reconocido) se normaliza a `AMBIGUOUS`: la política vigente de
      // `attemptCharge` en `./charge.ts` decide qué hacer con eso.
      throw error;
    }
  };
}

/** Type guard de `StripeCardError` sin depender de `instanceof` (ADR-0011 §D5). */
function isStripeCardError(error: unknown): error is Stripe.errors.StripeCardError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type: unknown }).type === 'StripeCardError'
  );
}

let defaultChargeClientPromise: Promise<StripeChargeClient> | undefined;

/**
 * Cliente de cargos real por defecto de `./charge.ts`: resuelve la llave
 * secreta de Stripe desde SSM (`./stripe-secret-key.ts`) la primera vez que
 * se necesita en cada instancia cálida de la Lambda y construye el cliente
 * una única vez (reemplaza al stub `notImplementedCulqiClient`, que
 * desaparece con esta migración).
 */
export async function getDefaultStripeChargeClient(): Promise<StripeChargeClient> {
  defaultChargeClientPromise ??= (async () => {
    const secretKey = await getStripeSecretKey();
    return createStripeChargeClient(secretKey);
  })();
  return defaultChargeClientPromise;
}

/** Solo para pruebas: limpia el cliente por defecto cacheado entre casos. */
export function resetDefaultStripeChargeClientForTests(): void {
  defaultChargeClientPromise = undefined;
}
