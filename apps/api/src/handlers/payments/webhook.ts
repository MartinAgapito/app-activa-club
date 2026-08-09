// POST /payments/webhook — confirmación asíncrona de Culqi (US-024,
// docs/api/contratos-api.md §5, ADR-0007). Ruta **pública**, sin Cognito
// Authorizer (US-019): la autorización de este endpoint es la verificación
// de firma del webhook (`../../payments/webhook-signature.ts`), no un JWT.
//
// Orden de operaciones (criterios 2/8, "no acepta ninguna operación basada
// solo en el contenido del cuerpo sin firma válida"):
// 1. Se lee el cuerpo crudo (decodificado de base64 si aplica) sin
//    intentar parsearlo como JSON todavía.
// 2. Se verifica su firma HMAC contra el secreto de webhook. Una firma
//    inválida o ausente rechaza la solicitud (4xx) **antes** de cualquier
//    `JSON.parse`, sin aplicar ningún efecto.
// 3. Solo si la firma es válida se valida el cuerpo como JSON contra
//    `culqiWebhookEventSchema` y se delega el procesamiento de negocio en
//    `../../payments/webhook.ts` (que converge con la ruta síncrona de
//    US-021).
// 4. Se responde 202 siempre que la firma sea válida (docs/api/contratos-api.md
//    §5), sin importar el desenlace de negocio (confirmado / ya resuelto /
//    fallo registrado / pago no reconocido): así Culqi no puede distinguir
//    por el código HTTP si un `paymentId` existe o no en este sistema
//    (criterios 6/7, sin filtrar información interna al emisor).

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

import { AppError } from '../../lib/errors';
import { jsonResponse, parseJsonBody } from '../../lib/http';
import { logger } from '../../lib/logger';
import { withHandler } from '../../middleware/with-handler';
import { culqiWebhookEventSchema } from '../../payments/webhook-event-schema';
import { processCulqiWebhookEvent } from '../../payments/webhook';
import { getCulqiWebhookSecret } from '../../payments/webhook-secret';
import {
  extractSignatureHeader,
  verifyCulqiWebhookSignature,
} from '../../payments/webhook-signature';

/** Cuerpo crudo tal como Culqi lo firmó: si API Gateway lo entrega en base64, se decodifica antes de calcular el HMAC (nunca se recalcula a partir del JSON re-serializado, que podría no coincidir byte a byte). */
function getRawBody(event: APIGatewayProxyEvent): string {
  if (event.body === null || event.body === undefined) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

async function handleCulqiWebhook(
  event: APIGatewayProxyEvent,
  ctx: { requestId: string },
): Promise<APIGatewayProxyResult> {
  const rawBody = getRawBody(event);
  const signatureHeader = extractSignatureHeader(event.headers);
  const secret = await getCulqiWebhookSecret();

  if (!verifyCulqiWebhookSignature(rawBody, signatureHeader, secret)) {
    // Criterio 2: registrado como intento sospechoso, sin ningún cambio de
    // estado (esta rama termina aquí, nunca llega a parsear el cuerpo).
    logger.warn('culqi webhook rejected: invalid or missing signature (suspicious attempt)', {
      requestId: ctx.requestId,
      route: 'PAYMENTS_WEBHOOK',
      action: 'CULQI_WEBHOOK_SIGNATURE',
      outcome: 'FAILURE',
      hasSignatureHeader: signatureHeader !== undefined,
    });
    throw new AppError('UNAUTHENTICATED', 'Firma de webhook inválida o ausente.');
  }

  const parsedEvent = parseJsonBody(rawBody, culqiWebhookEventSchema);

  const result = await processCulqiWebhookEvent({ event: parsedEvent, requestId: ctx.requestId });

  logger.info('culqi webhook processed', {
    requestId: ctx.requestId,
    route: 'PAYMENTS_WEBHOOK',
    action: 'CULQI_WEBHOOK',
    outcome: 'SUCCESS',
    result,
    eventType: parsedEvent.type,
  });

  return jsonResponse(202, { received: true });
}

export const handler = withHandler<APIGatewayProxyEvent>('PAYMENTS_WEBHOOK', handleCulqiWebhook);
