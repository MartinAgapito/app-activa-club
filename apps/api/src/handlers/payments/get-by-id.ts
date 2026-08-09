// GET /payments/{paymentId} — detalle de un pago (docs/api/contratos-api.md
// §5, docs/scrum/historias/US-025-historial-pagos.md). `member`: solo su
// propio pago; `admin`: cualquiera (RN-PAG-04, RN-PAG-08, RN-ADM-03).
//
// Visibilidad ajena (criterio 5): un `member` que pide el detalle de un pago
// que no le pertenece recibe 404 `NOT_FOUND`, igual que un `paymentId`
// inexistente (criterio 6) — se elige 404 en vez de 403 para no confirmarle
// a un socio que ese `paymentId` existe y es de otra persona (mínima
// superficie de información; el contrato admite ambas opciones, ver US-025
// criterio 5). Esta restricción se resuelve siempre en el backend
// (criterio 12): la rama `member` nunca consulta un pago fuera de la
// partición del socio autenticado (`getPaymentByMemberAndId`, acotada a
// `PK=MEMBER#<memberId propio>`), así que no hay forma de que devuelva datos
// ajenos aunque el cliente manipule la ruta.

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getDocumentClient } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse } from '../../lib/http';
import { findMemberByCognitoSub } from '../../members/repository';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import {
  findPaymentById,
  getPaymentByMemberAndId,
  toPaymentSummary,
} from '../../payments/repository';
import { requirePaymentIdPathParam } from './path-params';

async function handleGetPaymentById(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const paymentId = requirePaymentIdPathParam(event);

  if (!identity.roles.includes('admin')) {
    const member = await findMemberByCognitoSub(getDocumentClient(), identity.sub);
    if (!member) {
      // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
      throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
    }

    const payment = await getPaymentByMemberAndId(getDocumentClient(), member.memberId, paymentId);
    if (!payment) {
      throw new AppError('NOT_FOUND', 'No se encontró el pago indicado.');
    }
    return jsonResponse(200, toPaymentSummary(payment));
  }

  const payment = await findPaymentById(getDocumentClient(), paymentId);
  if (!payment) {
    throw new AppError('NOT_FOUND', 'No se encontró el pago indicado.');
  }
  return jsonResponse(200, toPaymentSummary(payment));
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'GET_PAYMENT_BY_ID',
  handleGetPaymentById,
);
