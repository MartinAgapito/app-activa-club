// Anticipación del bloqueo por deuda o membresía vencida (US-032, criterio
// 10; RN-RES-12 y RN-PAG-06).
//
// Solo adelanta la experiencia: el servidor sigue siendo la fuente de verdad
// y responde `MEMBER_HAS_DEBT` / `MEMBERSHIP_REQUIRED` al confirmar. Usa
// `GET /members/me` (`canReserve` de `GET /dashboard/member` no existe aún).

import type { Member } from '@activa-club/shared-types';

export type ReservationBlock = 'DEBT' | 'MEMBERSHIP_REQUIRED';

export function getReservationBlock(
  member: Pick<Member, 'membershipStatus' | 'outstandingBalance'>,
): ReservationBlock | null {
  if (member.membershipStatus === 'DEBT' || member.outstandingBalance > 0) {
    return 'DEBT';
  }
  if (member.membershipStatus === 'EXPIRED' || member.membershipStatus === 'NONE') {
    return 'MEMBERSHIP_REQUIRED';
  }
  return null;
}

export const RESERVATION_BLOCK_COPY: Record<ReservationBlock, { title: string; message: string }> =
  {
    DEBT: {
      title: 'No puedes reservar por ahora',
      message:
        'Tienes un saldo pendiente de membresía. Regulariza tu pago para volver a reservar instalaciones.',
    },
    MEMBERSHIP_REQUIRED: {
      title: 'No puedes reservar por ahora',
      message:
        'Tu membresía no está vigente. Renueva o paga tu membresía para volver a reservar instalaciones.',
    },
  };
