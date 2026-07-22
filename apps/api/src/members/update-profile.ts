// Orquestador de PATCH /members/me (docs/api/contratos-api.md §4,
// docs/scrum/historias/US-018-perfil-usuario.md, RN-ACT-02/03): resuelve el
// socio autenticado por su `cognitoSub` (nunca por un parámetro de la
// solicitud) y actualiza únicamente sus datos de contacto editables
// (`phone`). El DNI y el correo de identidad no pasan por aquí: no forman
// parte de `UpdateMemberRequest`/`updateMemberSchema`, así que un intento de
// enviarlos se descarta de forma controlada antes de llegar a este módulo.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member, UpdateMemberRequest } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { findMemberByCognitoSub, updateMemberContact } from './repository';

export interface UpdateMemberProfileInput {
  /** `cognitoSub` de la identidad autenticada (nunca un `memberId` de la URL: no existe tal parámetro). */
  cognitoSub: string;
  request: UpdateMemberRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

/**
 * Actualiza el perfil propio del socio autenticado (US-018, criterio 2). Es
 * idempotente: reenviar el mismo `phone` no produce efectos adversos, solo
 * refresca `updatedAt` (criterio "actualización sin cambios reales").
 */
export async function updateMemberProfile(input: UpdateMemberProfileInput): Promise<Member> {
  const client = input.client ?? getDocumentClient();

  const existing = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!existing) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  return updateMemberContact(client, existing.memberId, input.request, input.now?.toISOString());
}
