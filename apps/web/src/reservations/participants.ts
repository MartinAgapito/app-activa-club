// Modelo de los participantes en construcción de una reserva (US-032) y
// reglas de UX para agregarlos. Son anticipaciones: la fuente de verdad es el
// servidor (criterio 14), que vuelve a validar aforo, solapes y cupos.

import { z } from 'zod';
import type { ReservationParticipantInput } from '@activa-club/shared-types';

export type DraftParticipant =
  | { type: 'MEMBER'; memberId: string; firstName: string; lastName: string }
  | {
      type: 'GUEST';
      dni: string;
      firstName: string;
      lastName: string;
      /** `true` si el DNI ya tenía perfil: el nombre es el registrado y no
       * se puede cambiar (ADR-0009, criterio 4). */
      registered: boolean;
    };

export function participantKey(participant: DraftParticipant): string {
  return participant.type === 'MEMBER'
    ? `MEMBER#${participant.memberId}`
    : `GUEST#${participant.dni}`;
}

export function participantFullName(participant: DraftParticipant): string {
  return `${participant.firstName} ${participant.lastName}`;
}

/** Convierte un participante en el input del contrato. El socio nunca
 * escribe un `memberId`: viene del lookup. */
export function toParticipantInput(participant: DraftParticipant): ReservationParticipantInput {
  return participant.type === 'MEMBER'
    ? { type: 'MEMBER', memberId: participant.memberId }
    : {
        type: 'GUEST',
        dni: participant.dni,
        firstName: participant.firstName,
        lastName: participant.lastName,
      };
}

/** Acompañantes máximos además del titular: el aforo incluye al titular
 * (RN-RES-09), p. ej. piscina de 5 = titular + 4. */
export function maxCompanions(capacity: number): number {
  return Math.max(capacity - 1, 0);
}

export function capacityLimitMessage(resourceName: string, capacity: number): string {
  const companions = maxCompanions(capacity);
  return `${resourceName}: aforo de ${capacity} personas, es decir, tú más ${companions} ${
    companions === 1 ? 'acompañante' : 'acompañantes'
  }.`;
}

export interface AdditionContext {
  participants: DraftParticipant[];
  capacity: number;
  holderMemberId: string | null;
  holderDni: string | null;
}

/** Devuelve un mensaje si el participante no debería agregarse, o `null`. */
export function validateAddition(
  candidate: DraftParticipant,
  context: AdditionContext,
): string | null {
  if (context.participants.some((item) => participantKey(item) === participantKey(candidate))) {
    return 'Esa persona ya está en la lista de participantes.';
  }
  if (candidate.type === 'MEMBER' && candidate.memberId === context.holderMemberId) {
    return 'Ese eres tú: ya participas como titular de la reserva.';
  }
  if (candidate.type === 'GUEST' && candidate.dni === context.holderDni) {
    return 'Ese DNI es el tuyo: ya participas como titular de la reserva.';
  }
  if (context.participants.length >= maxCompanions(context.capacity)) {
    return 'Alcanzaste el aforo de la instalación. Quita a alguien para agregar a otra persona.';
  }
  return null;
}

/** Nombre y apellido de un invitado nuevo; mismos límites que
 * `reservationParticipantInputSchema` de @activa-club/validation. */
export const guestNameFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'Ingresa el nombre del invitado.')
    .max(80, 'El nombre es demasiado largo.'),
  lastName: z
    .string()
    .trim()
    .min(1, 'Ingresa el apellido del invitado.')
    .max(80, 'El apellido es demasiado largo.'),
});
export type GuestNameFormValues = z.infer<typeof guestNameFormSchema>;
