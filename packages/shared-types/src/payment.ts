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
  culqiChargeId: string | null;
  idempotencyKey: string;
  autoRenewRequested: boolean;
  failureReason: string | null;
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
  /** Token generado por Culqi.js en el cliente. */
  culqiToken: string;
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
