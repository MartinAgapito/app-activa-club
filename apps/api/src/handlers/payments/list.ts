// GET /payments?memberId=&status=&cursor=&limit= — historial de pagos:
// propio (member) o filtrado (admin) (docs/api/contratos-api.md §5,
// docs/scrum/historias/US-025-historial-pagos.md). RN-PAG-04, RN-PAG-08,
// RN-ADM-03.
//
// Visibilidad propio/ajeno (criterio 4, crítico): un `member` ve **solo**
// sus propios pagos. El `memberId` siempre se resuelve desde la identidad
// autenticada (`cognitoSub` → `findMemberByCognitoSub`), nunca desde la
// query del cliente: si un `member` envía `memberId` de otro socio, ese
// valor se ignora por completo (no se lee `query.memberId` en absoluto para
// el rol `member`) — así nunca hay una rama de código que pueda devolver
// pagos ajenos a un socio, sin depender de una comparación que se pudiera
// olvidar.
//
// `admin` puede filtrar por `memberId` y/o `status` (criterio 3). Si no
// envía ninguno de los dos, se rechaza con `VALIDATION_ERROR`: el modelo de
// datos de `Payment` (docs/data/modelo-dynamodb.md §3.5/§4) solo define
// patrones de acceso por socio (#3) o por estado (#16, GSI2), no "todos los
// pagos sin filtro" — igual que la misma decisión ya tomada para
// `GET /members` (`../members/list.ts`), para evitar un `Scan` completo de
// la tabla (norma de ingeniería del proyecto).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';
import { listPaymentsQuerySchema } from '@activa-club/validation';

import { getDocumentClient } from '../../lib/dynamo';
import { AppError } from '../../lib/errors';
import { jsonResponse, parseQuery } from '../../lib/http';
import { findMemberByCognitoSub } from '../../members/repository';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listPaymentsByMember, listPaymentsByStatus } from '../../payments/repository';

async function handleListPayments(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const query = parseQuery(event.queryStringParameters, listPaymentsQuerySchema);
  const pageOptions = {
    ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };

  if (!identity.roles.includes('admin')) {
    // `member`: siempre su propio historial (criterio 4); `query.memberId` no
    // se usa en esta rama en absoluto.
    const member = await findMemberByCognitoSub(getDocumentClient(), identity.sub);
    if (!member) {
      // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
      throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
    }

    const result = await listPaymentsByMember(getDocumentClient(), member.memberId, {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...pageOptions,
    });
    return jsonResponse(200, result);
  }

  // `admin`
  if (query.memberId) {
    const result = await listPaymentsByMember(getDocumentClient(), query.memberId, {
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...pageOptions,
    });
    return jsonResponse(200, result);
  }

  if (query.status) {
    const result = await listPaymentsByStatus(getDocumentClient(), query.status, pageOptions);
    return jsonResponse(200, result);
  }

  throw new AppError('VALIDATION_ERROR', 'Debe indicar memberId o status para listar pagos.');
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_PAYMENTS',
  handleListPayments,
);
