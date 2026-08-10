// Configuración de planes de membresía (RN-PAG-01/02, docs/api/contratos-api.md
// §5). El monto y la moneda a cobrar siempre se resuelven **aquí**, nunca
// desde un valor enviado por el cliente (US-021, "Reglas de cálculo de
// vigencia": "el monto cobrado es siempre el del plan resuelto por el
// backend").
//
// Nota de alcance (US-021 vs US-020): `GET /memberships/plans` (US-020) es una
// historia separada, todavía no implementada. Este módulo define el mínimo de
// configuración de planes que US-021 necesita para resolver el monto/moneda a
// cobrar; se deja pensado para que US-020 lo reuse (`getMembershipPlans`) en
// vez de duplicar la tabla de precios. Los montos por defecto son valores
// **placeholder** del MVP (el anual coincide con el ejemplo de
// docs/api/contratos-api.md §5; el mensual es una estimación proporcional sin
// confirmar por Producto): quedan parametrizados por variable de entorno para
// que Producto/Arquitectura los ajusten sin tocar código, y deben confirmarse
// formalmente cuando se implemente US-020.

import type { Currency, MembershipPlan, MembershipType } from '@activa-club/shared-types';

import { optionalEnv } from '../lib/env';
import { AppError } from '../lib/errors';

const CURRENCY: Currency = 'PEN';

/** Monto placeholder del plan mensual, en céntimos (S/ 120.00). Ver nota de alcance arriba. */
const DEFAULT_MONTHLY_AMOUNT_CENTS = 12_000;

/** Monto placeholder del plan anual, en céntimos (S/ 1200.00; mismo valor que el ejemplo del contrato). */
const DEFAULT_ANNUAL_AMOUNT_CENTS = 120_000;

/**
 * Facilidades de pago con tarjeta para el plan anual (RN-PAG-02): depende de
 * si Stripe test mode soporta cuotas para el método de pago usado, algo no
 * confirmado todavía (ver ADR-0011, "Validaciones requeridas antes de
 * implementar"). Se deja en `false` hasta confirmarlo; US-020/US-022 deben
 * leer este valor, no inventar uno propio.
 */
const ANNUAL_ALLOWS_INSTALLMENTS = false;

function parseAmountEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Planes de membresía disponibles, con su monto (céntimos) resuelto por configuración de ambiente. */
export function getMembershipPlans(): MembershipPlan[] {
  return [
    {
      type: 'MONTHLY',
      amount: parseAmountEnv('MEMBERSHIP_MONTHLY_AMOUNT_CENTS', DEFAULT_MONTHLY_AMOUNT_CENTS),
      currency: CURRENCY,
      label: 'Mensual',
    },
    {
      type: 'ANNUAL',
      amount: parseAmountEnv('MEMBERSHIP_ANNUAL_AMOUNT_CENTS', DEFAULT_ANNUAL_AMOUNT_CENTS),
      currency: CURRENCY,
      label: 'Anual',
      allowsInstallments: ANNUAL_ALLOWS_INSTALLMENTS,
    },
  ];
}

/**
 * Resuelve el plan a cobrar por `membershipType` (criterio 6: un tipo no
 * soportado responde 400 `VALIDATION_ERROR`). `createPaymentSchema` ya limita
 * `membershipType` al enum `MONTHLY`/`ANNUAL`, así que esta rama defensiva no
 * debería alcanzarse en producción; se mantiene por seguridad si el enum de
 * `MembershipType` creciera sin actualizar este módulo.
 */
export function resolveMembershipPlan(membershipType: MembershipType): MembershipPlan {
  const plan = getMembershipPlans().find((candidate) => candidate.type === membershipType);
  if (!plan) {
    throw new AppError('VALIDATION_ERROR', 'El tipo de membresía solicitado no está soportado.');
  }
  return plan;
}
