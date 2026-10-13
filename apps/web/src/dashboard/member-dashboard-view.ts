// Derivados de presentación de `GET /dashboard/member` (US-056).
//
// El servidor decide si el socio puede reservar (`canReserve`) y qué alertas
// corresponden; aquí solo se elige el texto y la acción a mostrar. Los códigos
// de alerta no se muestran nunca: se muestra el `message` del servidor.

import type { MemberDashboard } from '@activa-club/shared-types';

export const ALERT_CODE = {
  RENEWAL_DUE: 'RENEWAL_DUE',
  MEMBERSHIP_EXPIRED: 'MEMBERSHIP_EXPIRED',
  PAYMENT_DEBT: 'PAYMENT_DEBT',
} as const;

export type MembershipAction = 'PAY' | 'RENEW' | null;

function hasAlert(dashboard: MemberDashboard, code: string): boolean {
  return dashboard.alerts.some((alert) => alert.code === code);
}

function owesMoney(dashboard: MemberDashboard): boolean {
  const { membership } = dashboard;
  return (
    membership.status === 'DEBT' ||
    membership.outstandingBalance > 0 ||
    hasAlert(dashboard, ALERT_CODE.PAYMENT_DEBT)
  );
}

/** Acción contextual de la tarjeta de membresía. */
export function membershipAction(dashboard: MemberDashboard): {
  action: MembershipAction;
  label: string | null;
} {
  const { membership } = dashboard;
  if (owesMoney(dashboard) || membership.status === 'NONE') {
    return { action: 'PAY', label: 'Pagar membresía' };
  }
  if (
    membership.status === 'EXPIRED' ||
    membership.status === 'EXPIRING_SOON' ||
    hasAlert(dashboard, ALERT_CODE.MEMBERSHIP_EXPIRED) ||
    hasAlert(dashboard, ALERT_CODE.RENEWAL_DUE)
  ) {
    return { action: 'RENEW', label: 'Renovar membresía' };
  }
  return { action: null, label: null };
}

/** Mensaje cuando todavía no hay membresía (estado `NONE`, sin primer pago). */
export function noMembershipMessage(dashboard: MemberDashboard): string {
  return dashboard.member.memberStatus === 'APPROVED'
    ? 'Tu solicitud fue aprobada. Paga tu primera membresía para activarla y empezar a reservar.'
    : 'Aún no tienes una membresía vigente. Paga tu primera membresía para empezar a reservar.';
}

/** Motivo corto por el que "Nueva reserva" está deshabilitada (solo se usa
 * cuando `canReserve=false`). Se apoya en el estado devuelto por el servidor y
 * no inventa códigos: sin señal clara usa el primer aviso o un texto genérico. */
export function reservationBlockedReason(dashboard: MemberDashboard): string {
  const { membership, member } = dashboard;
  if (owesMoney(dashboard)) {
    return 'Tienes un saldo pendiente de membresía. Regulariza tu pago para volver a reservar.';
  }
  if (membership.status === 'EXPIRED' || hasAlert(dashboard, ALERT_CODE.MEMBERSHIP_EXPIRED)) {
    return 'Tu membresía venció. Renuévala para volver a reservar.';
  }
  if (membership.status === 'NONE' || member.memberStatus === 'APPROVED') {
    return noMembershipMessage(dashboard);
  }
  return dashboard.alerts[0]?.message ?? 'Regulariza tu membresía para poder reservar.';
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de vencimiento legible. Tolera `YYYY-MM-DD` (día calendario, sin
 * corrimiento de zona) o un instante ISO con hora (se muestra el día de Lima).
 * Devuelve `null` si no hay fecha o es inválida. */
export function formatMembershipEnd(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const dateOnly = DATE_ONLY.test(endsAt);
  const date = new Date(dateOnly ? `${endsAt}T00:00:00Z` : endsAt);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeZone: dateOnly ? 'UTC' : 'America/Lima',
  }).format(date);
}

export function daysLabel(days: number): string {
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  return `Vence en ${days} días`;
}
