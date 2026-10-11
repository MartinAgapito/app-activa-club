import { describe, expect, it } from 'vitest';
import {
  maxCompanions,
  toParticipantInput,
  validateAddition,
  type DraftParticipant,
} from './participants';
import { getReservationBlock } from './eligibility';

const MARIA: DraftParticipant = {
  type: 'MEMBER',
  memberId: 'm-1',
  firstName: 'María',
  lastName: 'Quispe',
};

describe('participants', () => {
  it('el aforo incluye al titular: piscina de 5 admite 4 acompañantes', () => {
    expect(maxCompanions(5)).toBe(4);
    expect(maxCompanions(1)).toBe(0);
  });

  it('toParticipantInput no envía nombres de socios ni el flag interno de invitado', () => {
    expect(toParticipantInput(MARIA)).toEqual({ type: 'MEMBER', memberId: 'm-1' });
    expect(
      toParticipantInput({
        type: 'GUEST',
        dni: '70605040',
        firstName: 'Ana',
        lastName: 'Torres',
        registered: true,
      }),
    ).toEqual({ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' });
  });

  it('validateAddition rechaza duplicados, al titular y el exceso de aforo', () => {
    const context = {
      participants: [MARIA],
      capacity: 3,
      holderMemberId: 'holder',
      holderDni: '11111111',
    };
    expect(validateAddition(MARIA, context)).toMatch(/ya está en la lista/i);
    expect(validateAddition({ ...MARIA, memberId: 'holder' }, context)).toMatch(/ese eres tú/i);
    expect(
      validateAddition(
        { type: 'GUEST', dni: '11111111', firstName: 'A', lastName: 'B', registered: false },
        context,
      ),
    ).toMatch(/ese dni es el tuyo/i);
    expect(validateAddition({ ...MARIA, memberId: 'm-2' }, context)).toBeNull();
    expect(
      validateAddition(
        { ...MARIA, memberId: 'm-3' },
        { ...context, participants: [MARIA, { ...MARIA, memberId: 'm-2' }] },
      ),
    ).toMatch(/aforo/i);
  });

  it('getReservationBlock anticipa deuda y membresía no vigente', () => {
    expect(getReservationBlock({ membershipStatus: 'ACTIVE', outstandingBalance: 0 })).toBeNull();
    expect(
      getReservationBlock({ membershipStatus: 'EXPIRING_SOON', outstandingBalance: 0 }),
    ).toBeNull();
    expect(getReservationBlock({ membershipStatus: 'DEBT', outstandingBalance: 0 })).toBe('DEBT');
    expect(getReservationBlock({ membershipStatus: 'ACTIVE', outstandingBalance: 100 })).toBe(
      'DEBT',
    );
    expect(getReservationBlock({ membershipStatus: 'EXPIRED', outstandingBalance: 0 })).toBe(
      'MEMBERSHIP_REQUIRED',
    );
    expect(getReservationBlock({ membershipStatus: 'NONE', outstandingBalance: 0 })).toBe(
      'MEMBERSHIP_REQUIRED',
    );
  });
});
