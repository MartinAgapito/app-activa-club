// Integración con Stripe.js/Elements — US-037 (ADR-0011 §D1/§D2/§D8, RN-PAG-08).
// Reemplaza a la integración con Culqi.js entregada por US-022.
//
// Decisión de integración: se usa el **Card Element** de
// `@stripe/react-stripe-js` (montado por `CheckoutPage`) en vez del Payment
// Element. El Payment Element, sin un `client_secret` previo, exige el modo
// "deferred" (`elements({ mode: 'payment', amount, currency,
// paymentMethodCreation: 'manual' })`) para poder llamar a
// `stripe.createPaymentMethod` sin haber creado antes el PaymentIntent — el
// diseño de este backend (ADR-0011 §D3) crea el PaymentIntent recién en
// `POST /payments`, con `confirm: true` y el `payment_method` ya resuelto.
// El Card Element permite obtener el `pm_...` con
// `stripe.createPaymentMethod({ type: 'card', card: cardElement })`
// directamente, sin ese paso adicional, preservando 1:1 el contrato ya
// implementado (`POST /payments` recibe un identificador de método de pago
// ya creado). Los campos de tarjeta viven exclusivamente dentro del iframe
// que Stripe.js inyecta para el Card Element: ningún dato de tarjeta llega a
// tocar el DOM propio, el estado de React ni ningún `fetch` de esta
// aplicación (RN-PAG-08).
//
// Carga del script: `@stripe/stripe-js` inyecta el script de Stripe.js desde
// el dominio oficial de Stripe (`js.stripe.com`), nunca autoalojado —
// requisito PCI-DSS SAQ A (ADR-0011 §D2). `loadStripeClient` cachea la
// promesa de carga entre invocaciones y la invalida si falla (script
// bloqueado por un adblocker o sin red — caso alternativo de la historia),
// para permitir reintentar sin recargar la página.

import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';

/** Error de la pasarela de pago (script no cargó, llave publicable ausente,
 * o Stripe devolvió un error al crear el método de pago). Mensaje siempre
 * seguro para mostrar al socio: nunca incluye datos de tarjeta ni detalles
 * técnicos crudos del proveedor. */
export class StripePaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StripePaymentError';
  }
}

const SCRIPT_LOAD_ERROR_MESSAGE =
  'No pudimos cargar la pasarela de pago. Verifica tu conexión e intenta nuevamente.';

const NO_PUBLISHABLE_KEY_MESSAGE =
  'La pasarela de pago no está disponible en este momento. Contacta al club para regularizar tu pago.';

const GENERIC_CARD_ERROR_MESSAGE = 'No se pudo procesar la tarjeta. Intenta nuevamente.';

let stripeClientPromise: Promise<Stripe> | null = null;

/**
 * Carga Stripe.js una única vez por llave publicable y cachea la promesa
 * entre invocaciones. Si la llave publicable no está configurada, rechaza de
 * inmediato con `StripePaymentError` sin intentar cargar el script. Si el
 * script no llega a cargar (bloqueado por un adblocker, sin red, etc.),
 * `loadStripe` resuelve con `null`: se traduce a `StripePaymentError` y se
 * invalida la caché para permitir un reintento explícito del socio.
 */
export function loadStripeClient(publishableKey: string | undefined): Promise<Stripe> {
  if (!publishableKey) {
    return Promise.reject(new StripePaymentError(NO_PUBLISHABLE_KEY_MESSAGE));
  }

  if (!stripeClientPromise) {
    stripeClientPromise = loadStripe(publishableKey).then((stripe) => {
      if (!stripe) {
        throw new StripePaymentError(SCRIPT_LOAD_ERROR_MESSAGE);
      }
      return stripe;
    });
    stripeClientPromise.catch(() => {
      stripeClientPromise = null;
    });
  }

  return stripeClientPromise;
}

/** Solo para pruebas: limpia la caché de `loadStripeClient` entre casos. */
export function resetStripeClientCacheForTests(): void {
  stripeClientPromise = null;
}

export interface CreateStripePaymentMethodInput {
  stripe: Stripe;
  cardElement: StripeCardElement;
}

/**
 * Crea un `PaymentMethod` a partir de los datos ingresados en el Card
 * Element y resuelve con su identificador opaco (`pm_...`), el equivalente
 * exacto del `culqiToken` que entregaba Culqi.js. Rechaza con
 * `StripePaymentError` si Stripe reporta un error de validación/tarjeta —
 * el mensaje de `stripe.createPaymentMethod` ya está pensado por Stripe para
 * mostrarse al usuario final y nunca incluye el PAN completo ni el CVC.
 */
export async function createStripePaymentMethod(
  input: CreateStripePaymentMethodInput,
): Promise<string> {
  const { stripe, cardElement } = input;

  const result = await stripe.createPaymentMethod({
    type: 'card',
    card: cardElement,
  });

  if (result.error || !result.paymentMethod) {
    throw new StripePaymentError(result.error?.message ?? GENERIC_CARD_ERROR_MESSAGE);
  }

  return result.paymentMethod.id;
}
