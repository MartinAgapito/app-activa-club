// Precondición de estado del socio para poder pagar (US-021, precondiciones y
// criterio 7/8; RN-ACT-07, RN-PAG-06).
//
// "El socio tiene sesión iniciada con rol member y su memberStatus es
// APPROVED (primer pago) o ACTIVE (renovación / regularización de deuda)."
// Un socio PENDING o REJECTED no puede pagar (403 MEMBER_NOT_APPROVED); un
// socio ACTIVE con membershipStatus DEBT o EXPIRED sí puede (RN-PAG-06), ya
// que la validación es sobre `memberStatus`, no sobre `membershipStatus`.

import type { MemberStatus } from '@activa-club/shared-types';

import { AppError } from '../lib/errors';

const PAYMENT_ELIGIBLE_STATUSES: ReadonlySet<MemberStatus> = new Set(['APPROVED', 'ACTIVE']);

/**
 * Lanza `MEMBER_NOT_APPROVED` (403) si el socio no puede pagar según su
 * `memberStatus` actual. Debe llamarse antes de reservar la `idempotencyKey`
 * o de intentar cualquier cargo (criterio 7: "no se genera ningún cargo").
 */
export function assertMemberCanPay(memberStatus: MemberStatus): void {
  if (!PAYMENT_ELIGIBLE_STATUSES.has(memberStatus)) {
    throw new AppError(
      'MEMBER_NOT_APPROVED',
      'El socio debe estar aprobado o activo para pagar su membresía.',
    );
  }
}
