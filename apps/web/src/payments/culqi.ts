// Integración con Culqi.js — US-022 (ADR-0007, RN-PAG-08).
//
// Decisión de integración: se usa el widget "Checkout" oficial de Culqi.js
// v4 (script cargado desde el CDN oficial, `https://checkout.culqi.com/js/v4`)
// en vez de construir un formulario propio de número de tarjeta/CVV. Con
// Checkout, los campos de tarjeta viven exclusivamente dentro del iframe que
// Culqi.js inyecta al abrir el widget (`Culqi.open()`): ningún dato de
// tarjeta llega a tocar el DOM, el estado de React ni ningún `fetch` de esta
// aplicación (refuerza RN-PAG-08 — "los datos de tarjeta nunca llegan al
// backend" — con más margen: tampoco pasan por nuestro cliente). El backend
// solo recibe el `culqiToken` que el propio Culqi.js entrega tras tokenizar
// (docs/api/contratos-api.md §5).
//
// Alternativa considerada: un formulario propio con campos individuales
// (número/CVV/vencimiento) tokenizados campo a campo. Se descartó para esta
// historia: no hay forma de verificar el detalle exacto de esa variante de
// la API sin una cuenta Culqi sandbox real (hoy la llave pública es un
// placeholder, ver US-019); el widget Checkout es la integración
// documentada de forma estable y pública por Culqi para SPAs, y reduce la
// superficie de riesgo de RN-PAG-08 al no tener campos de tarjeta propios.
// Si Arquitecto/Backend confirman más adelante, con la cuenta real, que
// conviene un formulario inline, se puede reemplazar este módulo sin tocar
// el resto del checkout (la interfaz pública es solo `requestCulqiToken`).
//
// Manejo del caso "Culqi.js no carga" (bloqueado o sin red, caso alternativo
// de la historia): `loadCulqiScript` cachea la promesa de carga y la
// invalida si falla, para permitir reintentar sin recargar la página;
// `requestCulqiToken` nunca resuelve con un token si el script no cargó.

declare global {
  interface Window {
    Culqi?: CulqiGlobal;
    culqi?: () => void;
  }
}

export interface CulqiSettings {
  title: string;
  currency: string;
  /** Monto en céntimos, igual que el resto del contrato de pagos. */
  amount: number;
  description?: string;
}

export interface CulqiGlobal {
  publicKey: string;
  settings: (options: CulqiSettings) => void;
  open: () => void;
  close: () => void;
  token?: { id: string } | null;
  error?: { user_message?: string; merchant_message?: string; code?: string } | null;
}

const CULQI_SCRIPT_SRC = 'https://checkout.culqi.com/js/v4';

let scriptPromise: Promise<void> | null = null;

/** Carga Culqi.js una única vez y cachea la promesa entre invocaciones. Si
 * `window.Culqi` ya existe (script ya insertado antes, o inyectado por un
 * test), no vuelve a insertar el `<script>`. Si la carga falla, invalida la
 * caché para permitir un reintento explícito del socio (p. ej. tras
 * recuperar la conexión) en vez de quedar bloqueado para siempre. */
export function loadCulqiScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Culqi) {
    return Promise.resolve();
  }

  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = CULQI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (window.Culqi) {
        resolve();
      } else {
        reject(new Error('CULQI_SCRIPT_LOAD_FAILED'));
      }
    };
    script.onerror = () => reject(new Error('CULQI_SCRIPT_LOAD_FAILED'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

/** Error de la pasarela de pago (script no cargó, llave pública ausente, o
 * Culqi devolvió un error de tokenización). Mensaje siempre seguro para
 * mostrar al socio: nunca incluye datos de tarjeta ni detalles técnicos
 * crudos del proveedor. */
export class CulqiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CulqiError';
  }
}

export interface RequestCulqiTokenInput {
  publicKey: string;
  amount: number;
  currency: string;
  title: string;
  description: string;
}

const SCRIPT_LOAD_ERROR_MESSAGE =
  'No pudimos cargar la pasarela de pago. Verifica tu conexión e intenta nuevamente.';

/**
 * Abre el widget Checkout de Culqi.js y resuelve con el `culqiToken`
 * generado tras tokenizar la tarjeta, o rechaza con `CulqiError` si el
 * script no cargó, la llave pública no está configurada, o Culqi devuelve un
 * error de tokenización.
 *
 * Nota: si el socio cierra el widget sin completar el pago (caso
 * alternativo "el socio cierra la pantalla durante el pago"), esta promesa
 * no se resuelve ni se rechaza — Culqi.js no expone un evento de cierre
 * manual en el callback global. El llamante debe permitir cancelar la
 * espera desde la propia interfaz (ver `CheckoutPage`) en vez de asumir un
 * resultado que todavía no ocurrió.
 */
export async function requestCulqiToken(input: RequestCulqiTokenInput): Promise<string> {
  if (!input.publicKey) {
    throw new CulqiError(
      'La pasarela de pago no está disponible en este momento. Contacta al club para regularizar tu pago.',
    );
  }

  try {
    await loadCulqiScript();
  } catch {
    throw new CulqiError(SCRIPT_LOAD_ERROR_MESSAGE);
  }

  const culqi = window.Culqi;
  if (!culqi) {
    throw new CulqiError(SCRIPT_LOAD_ERROR_MESSAGE);
  }

  culqi.publicKey = input.publicKey;
  culqi.settings({
    title: input.title,
    currency: input.currency,
    amount: input.amount,
    description: input.description,
  });

  return new Promise<string>((resolve, reject) => {
    window.culqi = () => {
      const current = window.Culqi;
      const token = current?.token;
      if (token?.id) {
        resolve(token.id);
        return;
      }
      const message =
        current?.error?.user_message ?? 'No se pudo procesar la tarjeta. Intenta nuevamente.';
      reject(new CulqiError(message));
    };
    culqi.open();
  });
}
