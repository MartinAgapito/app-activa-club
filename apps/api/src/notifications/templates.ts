// Catálogo de textos de notificación en español (US-040, RN-NOT-04).
//
// Módulo puro: sin I/O, sin reloj. Para cada uno de los 13 `NotificationEvent`
// produce el título y el cuerpo breve de la bandeja, y el asunto, texto plano
// y HTML del correo. El texto del correo es el de la bandeja más un saludo y
// una despedida, de modo que "el correo coincide con la bandeja" (criterio 9).
//
// Datos sensibles (RN-PAG-08, criterio 4): cada evento declara en su tipo
// exactamente los datos que consume; el renderizador solo lee esos campos, así
// que un llamante no puede filtrar por accidente un DNI, un dato de tarjeta o
// un identificador de Stripe, aunque los pase como propiedad extra.

import type { MembershipType, NotificationEvent } from '@activa-club/shared-types';

import { cleanFreeText, escapeHtml, formatLimaDate, formatLimaRange, formatSoles } from './format';

/** Los 13 eventos del catálogo (docs/data/diccionario-de-datos.md). */
export const NOTIFICATION_EVENTS = [
  'ACCOUNT_ACTIVATED',
  'MEMBER_APPROVED',
  'MEMBER_REJECTED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'RENEWAL_DUE',
  'RENEWAL_OVERDUE',
  'RESERVATION_CONFIRMED',
  'RESERVATION_CANCELLED',
  'RESERVATION_APPROVED',
  'RESERVATION_REJECTED',
  'RESOURCE_MAINTENANCE',
  'RESERVATION_REMINDER',
] as const satisfies readonly NotificationEvent[];

interface ReservationSlotData {
  /** Nombre de la instalación (p. ej. "Cancha de fútbol 1"). */
  resourceName: string;
  /** Inicio ISO-8601 UTC. */
  startsAt: string;
  /** Fin ISO-8601 UTC. */
  endsAt: string;
}

/** Datos que cada evento necesita para armar su texto. */
export interface NotificationDataByEvent {
  ACCOUNT_ACTIVATED: Record<string, never>;
  MEMBER_APPROVED: Record<string, never>;
  MEMBER_REJECTED: { reason: string };
  PAYMENT_SUCCEEDED: {
    membershipType: MembershipType;
    /** Monto en céntimos. */
    amount: number;
    /** Nueva fecha de vencimiento (ISO). */
    membershipEndsAt: string;
  };
  /** `reason` es el motivo legible del catálogo propio de pagos, nunca el código crudo del proveedor. */
  PAYMENT_FAILED: { reason: string };
  RENEWAL_DUE: { membershipEndsAt: string };
  RENEWAL_OVERDUE: { membershipEndsAt: string };
  RESERVATION_CONFIRMED: ReservationSlotData;
  RESERVATION_APPROVED: ReservationSlotData;
  RESERVATION_REJECTED: ReservationSlotData & { reason: string };
  /** `cancelledBy`: si fue un administrador el texto lo dice, sin nombrarlo. */
  RESERVATION_CANCELLED: ReservationSlotData & { cancelledBy: 'MEMBER' | 'ADMIN' };
  RESOURCE_MAINTENANCE: ReservationSlotData;
  RESERVATION_REMINDER: ReservationSlotData & { participantCount: number };
}

export type NotificationData<E extends NotificationEvent> = NotificationDataByEvent[E];

/** Texto renderizado de una notificación. */
export interface RenderedNotification {
  /** Título de la bandeja. */
  title: string;
  /** Cuerpo breve de la bandeja (texto plano). */
  body: string;
  emailSubject: string;
  emailText: string;
  emailHtml: string;
}

/** Evento fuera del catálogo: error de programación, nunca se envía con texto genérico (criterio 3). */
export class UnknownNotificationEventError extends Error {
  constructor(event: unknown) {
    super(`Evento de notificación fuera del catálogo: ${String(event)}`);
    this.name = 'UnknownNotificationEventError';
  }
}

interface Content {
  title: string;
  body: string;
}

const PLAN_LABEL: Record<MembershipType, string> = {
  MONTHLY: 'mensual',
  ANNUAL: 'anual',
};

function planLabel(type: MembershipType): string {
  const label = PLAN_LABEL[type];
  if (label === undefined) throw new RangeError(`Tipo de membresía inválido: ${String(type)}`);
  return label;
}

function reasonOrFallback(reason: string): string {
  return cleanFreeText(reason) || 'No se indicó un motivo.';
}

function participants(count: number): string {
  return `${count} ${count === 1 ? 'participante' : 'participantes'}`;
}

const BUILDERS: { [E in NotificationEvent]: (data: NotificationDataByEvent[E]) => Content } = {
  ACCOUNT_ACTIVATED: () => ({
    title: 'Bienvenido a Activa Club',
    body: 'Tu cuenta digital quedó activada. Ya puedes iniciar sesión con tu correo y tu contraseña.',
  }),
  MEMBER_APPROVED: () => ({
    title: 'Tu solicitud fue aprobada',
    body: 'Aprobamos tu solicitud de socio. Para quedar activo y poder reservar, paga tu primera membresía desde la sección Membresía.',
  }),
  MEMBER_REJECTED: (data) => ({
    title: 'Tu solicitud no fue aprobada',
    body: `No pudimos aprobar tu solicitud de socio. Motivo: ${reasonOrFallback(data.reason)}`,
  }),
  PAYMENT_SUCCEEDED: (data) => ({
    title: 'Recibimos tu pago',
    body: `Tu pago de ${formatSoles(data.amount)} por la membresía ${planLabel(data.membershipType)} fue exitoso. Tu membresía está vigente hasta el ${formatLimaDate(data.membershipEndsAt)}.`,
  }),
  PAYMENT_FAILED: (data) => ({
    title: 'No pudimos procesar tu pago',
    body: `Tu pago no se completó. Motivo: ${reasonOrFallback(data.reason)} Puedes reintentarlo desde la sección Membresía.`,
  }),
  RENEWAL_DUE: (data) => ({
    title: 'Tu membresía está por vencer',
    body: `Tu membresía vence el ${formatLimaDate(data.membershipEndsAt)}. Renuévala desde la sección Membresía para seguir reservando sin interrupciones.`,
  }),
  RENEWAL_OVERDUE: (data) => ({
    title: 'Tu membresía venció',
    body: `Tu membresía venció el ${formatLimaDate(data.membershipEndsAt)}. Mientras no la renueves no podrás hacer reservas; puedes pagarla desde la sección Membresía.`,
  }),
  RESERVATION_CONFIRMED: (data) => ({
    title: 'Reserva confirmada',
    body: `Tu reserva en ${data.resourceName} quedó confirmada para el ${formatLimaRange(data.startsAt, data.endsAt)}.`,
  }),
  RESERVATION_APPROVED: (data) => ({
    title: 'Reserva aprobada',
    body: `Aprobaron tu reserva en ${data.resourceName} para el ${formatLimaRange(data.startsAt, data.endsAt)}.`,
  }),
  RESERVATION_REJECTED: (data) => ({
    title: 'Reserva rechazada',
    body: `Tu reserva en ${data.resourceName} para el ${formatLimaRange(data.startsAt, data.endsAt)} no fue aprobada. Motivo: ${reasonOrFallback(data.reason)}`,
  }),
  RESERVATION_CANCELLED: (data) => ({
    title: 'Reserva cancelada',
    body:
      data.cancelledBy === 'ADMIN'
        ? `El club canceló tu reserva en ${data.resourceName} del ${formatLimaRange(data.startsAt, data.endsAt)}.`
        : `Cancelaste tu reserva en ${data.resourceName} del ${formatLimaRange(data.startsAt, data.endsAt)}. Este aviso es tu constancia.`,
  }),
  RESOURCE_MAINTENANCE: (data) => ({
    title: 'Mantenimiento en una instalación que reservaste',
    body: `${data.resourceName} estará en mantenimiento el ${formatLimaRange(data.startsAt, data.endsAt)}, en un horario que coincide con tu reserva. Tu reserva no fue cancelada automáticamente; comunícate con el club para coordinar.`,
  }),
  RESERVATION_REMINDER: (data) => ({
    title: 'Recordatorio de tu reserva',
    body: `Te recordamos tu reserva en ${data.resourceName} el ${formatLimaRange(data.startsAt, data.endsAt)}, con ${participants(data.participantCount)}.`,
  }),
};

const SIGNATURE = 'Este es un aviso automático de Activa Club.';

function greeting(firstName: string): string {
  const name = cleanFreeText(firstName, 60);
  return name ? `Hola ${name},` : 'Hola,';
}

/**
 * Arma el texto de un evento. `firstName` es solo el nombre de pila del socio
 * (nunca apellidos ni DNI). Lanza `UnknownNotificationEventError` si el evento
 * no pertenece al catálogo.
 */
export function renderNotification<E extends NotificationEvent>(
  event: E,
  data: NotificationData<E>,
  firstName: string,
): RenderedNotification {
  if (!Object.prototype.hasOwnProperty.call(BUILDERS, event)) {
    throw new UnknownNotificationEventError(event);
  }
  const build = BUILDERS[event] as (d: NotificationData<E>) => Content;
  const { title, body } = build(data);
  const hello = greeting(firstName);

  const emailText = `${hello}\n\n${body}\n\n${SIGNATURE}\n`;
  const emailHtml =
    `<!doctype html><html lang="es"><body>` +
    `<p>${escapeHtml(hello)}</p>` +
    `<p><strong>${escapeHtml(title)}</strong></p>` +
    `<p>${escapeHtml(body)}</p>` +
    `<p><small>${escapeHtml(SIGNATURE)}</small></p>` +
    `</body></html>`;

  return { title, body, emailSubject: `Activa Club: ${title}`, emailText, emailHtml };
}
