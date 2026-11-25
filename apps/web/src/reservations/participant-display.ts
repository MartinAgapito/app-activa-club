// Nombre visible de un participante del detalle de reserva (US-080).
// Solo se usa nombre y apellido del socio (ADR-0009): nunca DNI, correo ni
// teléfono. Si el servidor no pudo resolver al socio (`member` null o
// ausente) se muestra un respaldo neutro.

import type { ReservationDetailParticipant } from '@activa-club/shared-types';

export const MEMBER_NAME_FALLBACK = 'Socio no disponible';

export function participantDisplayName(participant: ReservationDetailParticipant): string {
  switch (participant.participantType) {
    case 'HOLDER':
    case 'MEMBER': {
      const first = participant.member?.firstName.trim() ?? '';
      const last = participant.member?.lastName.trim() ?? '';
      const full = `${first} ${last}`.trim();
      return full === '' ? MEMBER_NAME_FALLBACK : full;
    }
    case 'GUEST':
      // Nunca se muestra el DNI del invitado.
      return participant.guestName ?? 'Invitado';
  }
}
