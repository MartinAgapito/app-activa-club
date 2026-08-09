// Orquestador de PATCH /members/me/auto-renew (docs/api/contratos-api.md §4,
// docs/scrum/historias/US-023-renovacion-membresia-autorenovacion.md,
// RN-PAG-03): resuelve el socio autenticado por su `cognitoSub` (nunca por un
// parámetro de la solicitud — no existe ningún `memberId` que aceptar del
// cliente, criterio 9: modificar la preferencia de otro socio no es un caso a
// validar, es un caso que no puede ocurrir por diseño) y activa o desactiva
// `autoRenew` con efecto inmediato (criterio 7).
//
// La precondición de estado reutiliza `assertMemberCanPay`
// (`../payments/eligibility.ts`, US-021): un socio debe estar `APPROVED` o
// `ACTIVE` para operar sobre su membresía (pagar o autorizar/revocar su
// renovación automática); un socio `PENDING`/`REJECTED` no puede (403/422
// `MEMBER_NOT_APPROVED`, criterio 3 de esta historia — mismo código que ya
// usa `POST /payments`). Es el mismo criterio de negocio en ambos endpoints,
// así que se reutiliza la función tal cual en vez de duplicar la regla.

import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

import { getDocumentClient } from '../lib/dynamo';
import { AppError } from '../lib/errors';
import { assertMemberCanPay } from '../payments/eligibility';
import { findMemberByCognitoSub, updateMemberAutoRenew as persistAutoRenew } from './repository';

export interface UpdateMemberAutoRenewInput {
  /** `cognitoSub` de la identidad autenticada (nunca un `memberId` de la solicitud: no existe tal parámetro). */
  cognitoSub: string;
  enabled: boolean;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Fecha de referencia inyectable, para pruebas deterministas. */
  now?: Date;
}

/**
 * Activa o desactiva la renovación automática del socio autenticado (US-023,
 * criterios 6/7/9/11). Es idempotente: reenviar el mismo valor de `enabled`
 * no produce efectos adversos, solo refresca `updatedAt`.
 */
export async function updateMemberAutoRenew(input: UpdateMemberAutoRenewInput): Promise<Member> {
  const client = input.client ?? getDocumentClient();

  const existing = await findMemberByCognitoSub(client, input.cognitoSub);
  if (!existing) {
    // No debería ocurrir para un token válido con socio ya enlazado; defensivo.
    throw new AppError('NOT_FOUND', 'No se encontró el socio asociado a esta cuenta.');
  }

  // Criterio 3 / casos alternativos: PENDING/REJECTED no puede activar ni
  // desactivar la preferencia (403/422 MEMBER_NOT_APPROVED).
  assertMemberCanPay(existing.memberStatus);

  return persistAutoRenew(client, existing.memberId, input.enabled, input.now?.toISOString());
}
