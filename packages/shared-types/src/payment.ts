// Entidades y DTOs de membresías y pagos (RN-PAG).
// Alineado con docs/api/contratos-api.md §5. Nunca incluye datos de tarjeta.

import type { Currency, ISODateString } from './common';
import type { MembershipType } from './member';

export type PaymentStatus = 'PENDING_CONFIRMATION' | 'SUCCEEDED' | 'FAILED';

/** Pago (entidad Payment). No almacena PAN/CVV ni secretos (RN-PAG-08). */
export interface Payment {
  paymentId: string;
  memberId: string;
  membershipType: MembershipType;
  /** Monto en céntimos. */
  amount: number;
  currency: Currency;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  idempotencyKey: string;
  autoRenewRequested: boolean;
  failureReason: string | null;
  createdAt: ISODateString;
  confirmedAt: ISODateString | null;
}

/**
 * Vista pública de un pago, expuesta por `GET /payments` y
 * `GET /payments/{paymentId}` (docs/api/contratos-api.md §5, US-025). Nunca
 * incluye `idempotencyKey` ni `failureReason` (campos internos de
 * orquestación, fuera del contrato público); el único identificador externo
 * es `stripePaymentIntentId` (criterio 7, RN-PAG-08).
 */
export interface PaymentSummary {
  paymentId: string;
  memberId: string;
  membershipType: MembershipType;
  /** Monto en céntimos. */
  amount: number;
  currency: Currency;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  createdAt: ISODateString;
  confirmedAt: ISODateString | null;
}

/** Plan de membresía ofrecido (valores mock parametrizables). */
export interface MembershipPlan {
  type: MembershipType;
  /** Precio en céntimos. */
  amount: number;
  currency: Currency;
  label: string;
  allowsInstallments?: boolean;
}

export interface MembershipPlansResponse {
  plans: MembershipPlan[];
}

export interface CreatePaymentRequest {
  membershipType: MembershipType;
  /** `pm_...` creado por Stripe.js/Elements en el cliente (ADR-0011 §D1/§D8). */
  stripePaymentMethodId: string;
  /** Clave de idempotencia para evitar cargos duplicados (RT-01). */
  idempotencyKey: string;
  autoRenew?: boolean;
}

export interface CreatePaymentResponse {
  paymentId: string;
  paymentStatus: PaymentStatus;
  membershipType: MembershipType;
  amount: number;
  currency: Currency;
  membershipEndsAt: ISODateString | null;
}
