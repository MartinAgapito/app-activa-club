// GET /resources — catálogo completo de instalaciones del club (member,
// admin), docs/api/contratos-api.md §6, docs/scrum/historias/US-028-catalogo-recursos-club.md.
//
// Sin filtros ni paginación: el catálogo son diez ítems fijos (ADR-0010) y
// ambos roles reciben exactamente la misma respuesta completa (criterios 3/4),
// incluyendo recursos en `MAINTENANCE` (criterio 8). Un catálogo aún no
// cargado por Terraform devuelve `[]` sin error (caso alternativo "catálogo
// vacío").
//
// El body es el array `Resource[]` plano (sin envoltorio `{ resources }`):
// mismo shape que ya consume `apps/web/src/resources/resources-client.ts`
// (`fetchResources(): Promise<Resource[]>`, preparado en Ola 1 para
// reconciliarse con `apiRequest<Resource[]>('/resources')` en US-032).

import type { APIGatewayProxyResult, APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda';

import { getDocumentClient } from '../../lib/dynamo';
import { jsonResponse } from '../../lib/http';
import { extractIdentity, requireRole } from '../../middleware/auth';
import { withHandler } from '../../middleware/with-handler';
import { listResources } from '../../resources/repository';

async function handleListResources(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  const identity = extractIdentity(event);
  requireRole(identity, ['member', 'admin']);

  const resources = await listResources(getDocumentClient());

  return jsonResponse(200, resources);
}

export const handler = withHandler<APIGatewayProxyWithCognitoAuthorizerEvent>(
  'LIST_RESOURCES',
  handleListResources,
);
