// Orquestador de POST /activation/verify (RN-ACT-01/02/03,
// docs/api/contratos-api.md §3, docs/scrum/historias/US-013-activacion-cuenta-socio-dni.md):
// resuelve el DNI a un socio migrado y confirma su elegibilidad para activar
// una cuenta digital, sin efectos de lado (no crea nada).

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { VerifyDniRequest, VerifyDniResponse } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { findMemberIdByDni, getMemberById } from './repository';
import { isEligibleMigratedMember, maskEmail } from './transform';

export interface VerifyActivationInput {
  request: VerifyDniRequest;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

/**
 * Verifica que un DNI corresponda a un socio migrado elegible para activar su
 * cuenta (RN-ACT-01/02/03): 404 `DNI_NOT_FOUND` si el DNI no existe como
 * socio, 409 `ALREADY_ACTIVATED` si ya tiene una cuenta digital enlazada. No
 * crea ni modifica nada; la activación real ocurre en `./complete.ts`.
 */
export async function verifyActivation(input: VerifyActivationInput): Promise<VerifyDniResponse> {
  const client = input.client ?? getDocumentClient();
  const dni = input.request.dni.trim();

  const memberId = await findMemberIdByDni(client, dni);
  if (!memberId) {
    throw new AppError('DNI_NOT_FOUND', 'No se encontró un socio migrado con este DNI.');
  }

  const member = await getMemberById(client, memberId);
  if (!member) {
    // No debería ocurrir: el ítem UniqueDni siempre se escribe junto al
    // Member en la misma transacción de migración (RT). Defensivo.
    logger.error('unique dni item without matching member', {
      requestId: 'activation-verify',
      route: 'VERIFY_ACTIVATION',
      action: 'VERIFY_ACTIVATION',
      outcome: 'FAILURE',
      memberId,
    });
    throw new AppError('INTERNAL_ERROR', 'Ocurrió un error interno inesperado.');
  }

  if (!isEligibleMigratedMember(member)) {
    throw new AppError('ALREADY_ACTIVATED', 'Este socio ya activó su cuenta digital.');
  }

  return {
    eligible: true,
    memberId: member.memberId,
    firstName: member.firstName,
    maskedEmail: maskEmail(member.email),
  };
}
