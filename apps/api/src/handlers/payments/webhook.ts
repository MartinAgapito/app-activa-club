// POST /payments/webhook — confirmación asíncrona de Stripe (US-024/US-037,
// docs/api/contratos-api.md §5, ADR-0011 §D6). Ruta **pública**, sin Cognito
// Authorizer (US-019): la autorización de este endpoint es la verificación
// de firma del webhook (`stripe.webhooks.constructEvent`), no un JWT.
//
// Orden de operaciones (criterios 8/9, "no acepta ninguna operación basada
// solo en el contenido del cuerpo sin firma válida"):
// 1. Se lee el cuerpo crudo (decodificado de base64 si aplica) sin
//    intentar parsearlo como JSON todavía.
// 2. Se verifica su firma con `stripe.webhooks.constructEvent` (esquema
//    `t=<timestamp>,v1=<hmac-sha256>` con tolerancia de timestamp
//    anti-replay, provisto por el SDK oficial — no una implementación
//    manual de HMAC). Una firma inválida, ausente o fuera de tolerancia
//    rechaza la solicitud (401 `UNAUTHENTICATED`) **antes** de cualquier
//    efecto.
// 3. Solo si la firma es válida se valida el cuerpo como JSON contra
//    `stripeWebhookEventSchema` y se delega el procesamiento de negocio en
//    `../../payments/webhook.ts` (que converge con la ruta síncrona de
//    US-021).
// 4. Se responde 202 siempre que la firma sea válida (docs/api/contratos-api.md
//    §5), sin importar el desenlace de negocio (confirmado / ya resuelto /
//    fallo registrado / pago no reconocido / tipo de evento ignorado): así
//    Stripe no puede distinguir por el código HTTP si un `paymentId` existe o
//    no en este sistema (criterios 6/7/9, sin filtrar información interna al
//    emisor).

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import Stripe from 'stripe';

import { AppError } from '../../lib/errors';
import { jsonResponse, parseJsonBody } from '../../lib/http';
import { logger } from '../../lib/logger';
import { withHandler } from '../../middleware/with-handler';
import { stripeWebhookEventSchema } from '../../payments/webhook-event-schema';
import { processStripeWebhookEvent } from '../../payments/webhook';
import { getStripeWebhookSecret } from '../../payments/webhook-secret';

/** Nombre del header de firma de Stripe (ADR-0011 §D6/§D8; reemplaza a `X-Culqi-Signature`). */
const SIGNATURE_HEADER_NAME = 'stripe-signature';

/**
 * Busca el header de firma de forma insensible a mayúsculas/minúsculas:
 * API Gateway (integración proxy REST) preserva el casing tal cual llega en
 * la solicitud, que puede variar entre clientes HTTP.
 */
function extractSignatureHeader(
  headers: Record<string, string | undefined> | null | undefined,
): string | undefined {
  if (!headers) return undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === SIGNATURE_HEADER_NAME && value) return value;
  }
  return undefined;
}

/** Cuerpo crudo tal como Stripe lo firmó: si API Gateway lo entrega en base64, se decodifica antes de verificar la firma (nunca se recalcula a partir del JSON re-serializado, que podría no coincidir byte a byte). */
function getRawBody(event: APIGatewayProxyEvent): string {
  if (event.body === null || event.body === undefined) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

async function handleStripeWebhook(
  event: APIGatewayProxyEvent,
  ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  const rawBody = getRawBody(event);
  const signatureHeader = extractSignatureHeader(event.headers);
  const secret = await getStripeWebhookSecret();

  try {
    if (!signatureHeader) {
      throw new Error('missing Stripe-Signature header');
    }
    // Solo se usa para verificar la autenticidad del cuerpo crudo (ADR-0011
    // §D2/§D6); el `Stripe.Event` tipado que devuelve se descarta a
    // propósito — el evento efectivamente usado por el resto del backend se
    // valida por separado con `stripeWebhookEventSchema` (más abajo), para
    // no acoplar el dominio propio al tipado completo del SDK.
    Stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
  } catch {
    // Criterio 8: registrado como intento sospechoso, sin ningún cambio de
    // estado (esta rama termina aquí, nunca llega a parsear el cuerpo contra
    // el esquema de negocio). `constructEvent` nunca expone el motivo exacto
    // del rechazo al llamante (RN-PAG-08, sin revelar detalles internos).
    logger.warn('stripe webhook rejected: invalid or missing signature (suspicious attempt)', {
      requestId: ctx.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'STRIPE_WEBHOOK_SIGNATURE',
      outcome: 'FAILURE',
      hasSignatureHeader: signatureHeader !== undefined,
    });
    throw new AppError('UNAUTHENTICATED', 'Firma de webhook inválida o ausente.');
  }

  const parsedEvent = parseJsonBody(rawBody, stripeWebhookEventSchema);

  const result = await processStripeWebhookEvent({ event: parsedEvent, requestId: ctx.requestId });

  logger.info('stripe webhook processed', {
    requestId: ctx.requestId,
    route: 'PAYMENTS_WEBHOOK',
    action: 'STRIPE_WEBHOOK',
    outcome: 'SUCCESS',
    result,
    eventType: parsedEvent.type,
  });

  return jsonResponse(202, { received: true });
}

export const handler = withHandler<APIGatewayProxyEvent>('PAYMENTS_WEBHOOK', handleStripeWebhook);
