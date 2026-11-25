import { describe, expect, it } from 'vitest';
import type { ReservationDetailParticipant } from '@activa-club/shared-types';
import { MEMBER_NAME_FALLBACK, participantDisplayName } from './participant-display';

function make(overrides: Partial<ReservationDetailParticipant>): ReservationDetailParticipant {
  return {
    participantId: 'p1',
    participantType: 'MEMBER',
    ...overrides,
  } as ReservationDetailParticipant;
}

describe('participantDisplayName', () => {
  it('muestra nombre y apellido del socio', () => {
    const p = make({ member: { memberId: 'm1', firstName: 'Lucía', lastName: 'Rojas' } });
    expect(participantDisplayName(p)).toBe('Lucía Rojas');
  });

  it('usa el respaldo cuando member es null o falta', () => {
    expect(participantDisplayName(make({ member: null }))).toBe(MEMBER_NAME_FALLBACK);
    expect(participantDisplayName(make({}))).toBe(MEMBER_NAME_FALLBACK);
  });

  it('usa el nombre del invitado sin exponer su DNI', () => {
    const p = make({ participantType: 'GUEST', guestName: 'Ana Paz', guestDni: '12345678' });
    expect(participantDisplayName(p)).toBe('Ana Paz');
  });
});
