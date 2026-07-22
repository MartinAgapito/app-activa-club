import { describe, expect, it } from 'vitest';

import { buildActivationUpdate, isEligibleMigratedMember, maskEmail } from './transform';

describe('isEligibleMigratedMember', () => {
  it('es elegible un socio MIGRATED sin cognitoSub enlazado', () => {
    expect(isEligibleMigratedMember({ memberStatus: 'MIGRATED', cognitoSub: null })).toBe(true);
  });

  it('no es elegible si ya tiene cognitoSub enlazado (ya activado)', () => {
    expect(isEligibleMigratedMember({ memberStatus: 'MIGRATED', cognitoSub: 'sub-1' })).toBe(false);
  });

  it('no es elegible si el memberStatus ya no es MIGRATED', () => {
    expect(isEligibleMigratedMember({ memberStatus: 'ACTIVE', cognitoSub: null })).toBe(false);
  });
});

describe('maskEmail', () => {
  it('conserva el primer carácter y el dominio completo (criterio 1)', () => {
    expect(maskEmail('maria.quispe@example.com')).toBe('m***@example.com');
  });

  it('funciona con un usuario de un solo carácter', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });
});

describe('buildActivationUpdate', () => {
  it('memberStatus siempre pasa a ACTIVE y enlaza cognitoSub/GSI1', () => {
    const result = buildActivationUpdate({
      cognitoSub: 'cognito-sub-1',
      membershipEndsAt: '2027-01-01',
      outstandingBalance: 0,
      currentMembershipStatus: 'ACTIVE',
      todayLima: '2026-07-21',
      now: '2026-07-21T00:00:00Z',
    });

    expect(result.memberStatus).toBe('ACTIVE');
    expect(result.membershipStatus).toBe('ACTIVE');
    expect(result.cognitoSub).toBe('cognito-sub-1');
    expect(result.GSI1PK).toBe('COGNITO#cognito-sub-1');
    expect(result.GSI1SK).toBe('MEMBER');
    expect(result.GSI2PK).toBe('MEMBER#STATUS#ACTIVE');
    expect(result.updatedAt).toBe('2026-07-21T00:00:00Z');
  });

  it('recalcula DEBT si hay saldo pendiente, aunque la membresía no haya vencido', () => {
    const result = buildActivationUpdate({
      cognitoSub: 'cognito-sub-1',
      membershipEndsAt: '2027-01-01',
      outstandingBalance: 5000,
      currentMembershipStatus: 'ACTIVE',
      todayLima: '2026-07-21',
    });

    expect(result.membershipStatus).toBe('DEBT');
  });

  it('recalcula EXPIRED si la membresía ya venció desde la migración', () => {
    const result = buildActivationUpdate({
      cognitoSub: 'cognito-sub-1',
      membershipEndsAt: '2026-01-01',
      outstandingBalance: 0,
      currentMembershipStatus: 'ACTIVE',
      todayLima: '2026-07-21',
    });

    expect(result.membershipStatus).toBe('EXPIRED');
  });

  it('usa el membershipStatus actual como respaldo si no hay membershipEndsAt (defensivo)', () => {
    const result = buildActivationUpdate({
      cognitoSub: 'cognito-sub-1',
      membershipEndsAt: null,
      outstandingBalance: 0,
      currentMembershipStatus: 'NONE',
      todayLima: '2026-07-21',
    });

    expect(result.membershipStatus).toBe('NONE');
  });
});
