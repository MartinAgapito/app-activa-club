import { describe, expect, it } from 'vitest';

import { sampleLegacyExport } from './fixtures/legacy-export.sample';
import { deriveMembershipStatus, limaDateOnly, transformLegacyMember } from './transform';

const TODAY_LIMA = '2026-07-09';

describe('deriveMembershipStatus', () => {
  it('prioriza DEBT si hay saldo pendiente, sin importar el vencimiento', () => {
    expect(deriveMembershipStatus('2027-01-01', 100, TODAY_LIMA)).toBe('DEBT');
  });

  it('marca EXPIRED si fin es anterior a hoy y no hay deuda', () => {
    expect(deriveMembershipStatus('2026-06-01', 0, TODAY_LIMA)).toBe('EXPIRED');
  });

  it('marca EXPIRING_SOON si vence dentro de los próximos 7 días', () => {
    expect(deriveMembershipStatus('2026-07-12', 0, TODAY_LIMA)).toBe('EXPIRING_SOON');
  });

  it('marca ACTIVE en cualquier otro caso', () => {
    expect(deriveMembershipStatus('2027-01-15', 0, TODAY_LIMA)).toBe('ACTIVE');
  });
});

describe('limaDateOnly', () => {
  it('formatea una fecha UTC como YYYY-MM-DD en zona America/Lima (UTC-5)', () => {
    expect(limaDateOnly(new Date('2026-07-09T12:00:00Z'))).toBe('2026-07-09');
    expect(limaDateOnly(new Date('2026-07-10T02:00:00Z'))).toBe('2026-07-09');
  });
});

describe('transformLegacyMember', () => {
  const [activo, conDeuda, porVencer, vencido] = sampleLegacyExport.socios;

  it('produce los 4 ítems documentados con las claves del modelo (mapeo-migracion.md §2/3)', () => {
    if (!activo) throw new Error('fixture inválido');
    const result = transformLegacyMember(activo, {
      todayLima: TODAY_LIMA,
      memberId: 'member-1',
      membershipId: 'membership-1',
      now: '2026-07-09T15:00:00Z',
    });

    expect(result.member.PK).toBe('MEMBER#member-1');
    expect(result.member.SK).toBe('PROFILE');
    expect(result.member.GSI1PK).toBeUndefined(); // sin cognitoSub aún (no activado)
    expect(result.member.GSI2PK).toBe('MEMBER#STATUS#MIGRATED');
    expect(result.member.GSI2SK).toBe('2026-07-09T15:00:00Z#member-1');
    expect(result.member.entityType).toBe('Member');
    expect(result.member.origin).toBe('MIGRATED');
    expect(result.member.memberStatus).toBe('MIGRATED');
    expect(result.member.cognitoSub).toBeNull();
    expect(result.member.legacyId).toBe(activo.legacyId);
    expect(result.member.membershipStatus).toBe('ACTIVE');
    expect(result.member.email).toBe(activo.email.toLowerCase());

    expect(result.uniqueDni.PK).toBe(`UNIQ#DNI#${activo.dni}`);
    expect(result.uniqueDni.memberId).toBe('member-1');
    expect(result.uniqueEmail.PK).toBe(`UNIQ#EMAIL#${activo.email.toLowerCase()}`);
    expect(result.uniqueEmail.memberId).toBe('member-1');

    expect(result.membershipPeriod.PK).toBe('MEMBER#member-1');
    expect(result.membershipPeriod.SK).toBe(`MEMBERSHIP#${activo.membresia.inicio}#membership-1`);
    expect(result.membershipPeriod.GSI2PK).toBe('MEMBERSHIP#ACTIVE');
    expect(result.membershipPeriod.GSI2SK).toBe(activo.membresia.fin);
    expect(result.membershipPeriod.status).toBe('ACTIVE');
  });

  it('conserva el saldo pendiente y deriva DEBT sin importar el vencimiento', () => {
    if (!conDeuda) throw new Error('fixture inválido');
    const result = transformLegacyMember(conDeuda, { todayLima: TODAY_LIMA });
    expect(result.member.membershipStatus).toBe('DEBT');
    expect(result.member.outstandingBalance).toBe(conDeuda.saldoPendiente);
    expect(result.membershipPeriod.status).toBe('DEBT');
    // Aún vigente en el tiempo (fin futuro): sí participa del índice de vencimiento.
    expect(result.membershipPeriod.GSI2PK).toBe('MEMBERSHIP#ACTIVE');
  });

  it('marca EXPIRING_SOON cuando el vencimiento está dentro de 7 días', () => {
    if (!porVencer) throw new Error('fixture inválido');
    const result = transformLegacyMember(porVencer, { todayLima: TODAY_LIMA });
    expect(result.member.membershipStatus).toBe('EXPIRING_SOON');
  });

  it('no agrega el GSI2 de "vigente" cuando la membresía migrada ya venció', () => {
    if (!vencido) throw new Error('fixture inválido');
    const result = transformLegacyMember(vencido, { todayLima: TODAY_LIMA });
    expect(result.member.membershipStatus).toBe('EXPIRED');
    expect(result.membershipPeriod.status).toBe('EXPIRED');
    expect(result.membershipPeriod.GSI2PK).toBeUndefined();
    expect(result.membershipPeriod.GSI2SK).toBeUndefined();
  });

  it('es determinista: memberId/membershipId/now inyectados producen el mismo resultado', () => {
    if (!activo) throw new Error('fixture inválido');
    const deps = {
      todayLima: TODAY_LIMA,
      memberId: 'member-fixed',
      membershipId: 'membership-fixed',
      now: '2026-07-09T00:00:00Z',
    };
    const first = transformLegacyMember(activo, deps);
    const second = transformLegacyMember(activo, deps);
    expect(first).toEqual(second);
  });
});
