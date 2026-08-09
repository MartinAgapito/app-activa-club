import { afterEach, describe, expect, it, vi } from 'vitest';

import { getMembershipPlans, resolveMembershipPlan } from './plans';

const ENV_KEYS = ['MEMBERSHIP_MONTHLY_AMOUNT_CENTS', 'MEMBERSHIP_ANNUAL_AMOUNT_CENTS'] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  vi.unstubAllEnvs();
});

describe('getMembershipPlans', () => {
  it('devuelve MONTHLY y ANNUAL en PEN con los montos por defecto (criterio 1 de US-020)', () => {
    const plans = getMembershipPlans();

    expect(plans).toHaveLength(2);
    const monthly = plans.find((plan) => plan.type === 'MONTHLY');
    const annual = plans.find((plan) => plan.type === 'ANNUAL');

    expect(monthly).toMatchObject({ type: 'MONTHLY', currency: 'PEN', label: 'Mensual' });
    expect(annual).toMatchObject({
      type: 'ANNUAL',
      currency: 'PEN',
      label: 'Anual',
      allowsInstallments: false,
    });
    expect(monthly?.amount).toBeGreaterThan(0);
    expect(annual?.amount).toBeGreaterThan(0);
  });

  it('el monto anual por defecto coincide con el ejemplo del contrato (docs/api/contratos-api.md §5)', () => {
    const plans = getMembershipPlans();
    const annual = plans.find((plan) => plan.type === 'ANNUAL');
    expect(annual?.amount).toBe(120_000);
  });

  it('permite parametrizar los montos por variable de entorno (criterio 3 de US-020)', () => {
    process.env['MEMBERSHIP_MONTHLY_AMOUNT_CENTS'] = '15000';
    process.env['MEMBERSHIP_ANNUAL_AMOUNT_CENTS'] = '150000';

    const plans = getMembershipPlans();

    expect(plans.find((plan) => plan.type === 'MONTHLY')?.amount).toBe(15000);
    expect(plans.find((plan) => plan.type === 'ANNUAL')?.amount).toBe(150000);
  });

  it('ignora un valor de entorno inválido y usa el monto por defecto', () => {
    process.env['MEMBERSHIP_MONTHLY_AMOUNT_CENTS'] = 'no-es-un-numero';

    const plans = getMembershipPlans();

    expect(plans.find((plan) => plan.type === 'MONTHLY')?.amount).toBe(12_000);
  });
});

describe('resolveMembershipPlan', () => {
  it('resuelve MONTHLY y ANNUAL desde la configuración del backend', () => {
    expect(resolveMembershipPlan('MONTHLY').type).toBe('MONTHLY');
    expect(resolveMembershipPlan('ANNUAL').type).toBe('ANNUAL');
  });

  it('lanza VALIDATION_ERROR (400) para un tipo de membresía no soportado', () => {
    expect(() => resolveMembershipPlan('WEEKLY' as never)).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});
