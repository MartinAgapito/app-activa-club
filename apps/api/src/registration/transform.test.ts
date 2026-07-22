import { describe, expect, it } from 'vitest';

import { buildNewMemberItems } from './transform';

describe('buildNewMemberItems', () => {
  const details = {
    dni: '10203040',
    email: 'Nuevo@Example.com',
    firstName: 'Juan',
    lastName: 'Pérez',
    phone: '999000111',
    cognitoSub: 'cognito-sub-1',
  };

  it('produce los 3 ítems documentados con las claves del modelo (modelo-dynamodb.md §3.1/3.2/3.3)', () => {
    const result = buildNewMemberItems(details, {
      memberId: 'member-1',
      now: '2026-07-21T00:00:00Z',
    });

    expect(result.member.PK).toBe('MEMBER#member-1');
    expect(result.member.SK).toBe('PROFILE');
    // El socio nuevo ya tiene cognitoSub desde el alta: GSI1 se puebla de inmediato.
    expect(result.member.GSI1PK).toBe('COGNITO#cognito-sub-1');
    expect(result.member.GSI1SK).toBe('MEMBER');
    expect(result.member.GSI2PK).toBe('MEMBER#STATUS#PENDING');
    expect(result.member.GSI2SK).toBe('2026-07-21T00:00:00Z#member-1');
    expect(result.member.entityType).toBe('Member');
    expect(result.member.origin).toBe('NEW');
    expect(result.member.memberStatus).toBe('PENDING');
    expect(result.member.cognitoSub).toBe('cognito-sub-1');
    expect(result.member.legacyId).toBeNull();
    expect(result.member.email).toBe('nuevo@example.com');
    expect(result.member.phone).toBe('999000111');
    expect(result.member.membershipType).toBeNull();
    expect(result.member.membershipStatus).toBe('NONE');
    expect(result.member.outstandingBalance).toBe(0);
    expect(result.member.autoRenew).toBe(false);
    expect(result.member.rejectionReason).toBeNull();

    expect(result.uniqueDni.PK).toBe('UNIQ#DNI#10203040');
    expect(result.uniqueDni.SK).toBe('UNIQ#DNI#10203040');
    expect(result.uniqueDni.entityType).toBe('UniqueDni');
    expect(result.uniqueDni.memberId).toBe('member-1');

    expect(result.uniqueEmail.PK).toBe('UNIQ#EMAIL#nuevo@example.com');
    expect(result.uniqueEmail.entityType).toBe('UniqueEmail');
    expect(result.uniqueEmail.memberId).toBe('member-1');
  });

  it('usa null en phone cuando no se provee (campo opcional del contrato)', () => {
    const { phone: _phone, ...withoutPhone } = details;
    const result = buildNewMemberItems(withoutPhone, { memberId: 'member-2' });

    expect(result.member.phone).toBeNull();
  });

  it('es determinista: memberId/now inyectados producen el mismo resultado', () => {
    const deps = { memberId: 'member-fixed', now: '2026-07-21T00:00:00Z' };
    const first = buildNewMemberItems(details, deps);
    const second = buildNewMemberItems(details, deps);
    expect(first).toEqual(second);
  });
});
