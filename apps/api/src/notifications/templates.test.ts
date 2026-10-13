import { describe, expect, it } from 'vitest';
import type { NotificationEvent } from '@activa-club/shared-types';

import { escapeHtml, formatLimaDate, formatLimaRange, formatLimaTime, formatSoles } from './format';
import {
  NOTIFICATION_EVENTS,
  UnknownNotificationEventError,
  renderNotification,
  type NotificationDataByEvent,
} from './templates';

// 2026-08-15 14:00-15:00 en Lima (UTC-5).
const slot = {
  resourceName: 'Cancha de fútbol 1',
  startsAt: '2026-08-15T19:00:00.000Z',
  endsAt: '2026-08-15T20:00:00.000Z',
};

const SAMPLES: { [E in NotificationEvent]: NotificationDataByEvent[E] } = {
  ACCOUNT_ACTIVATED: {},
  MEMBER_APPROVED: {},
  MEMBER_REJECTED: { reason: 'Documento ilegible' },
  PAYMENT_SUCCEEDED: {
    membershipType: 'MONTHLY',
    amount: 12_000,
    membershipEndsAt: '2026-09-10T04:59:59.000Z',
  },
  PAYMENT_FAILED: { reason: 'Fondos insuficientes' },
  RENEWAL_DUE: { membershipEndsAt: '2026-08-20T12:00:00.000Z' },
  RENEWAL_OVERDUE: { membershipEndsAt: '2026-08-10T12:00:00.000Z' },
  RESERVATION_CONFIRMED: slot,
  RESERVATION_APPROVED: slot,
  RESERVATION_REJECTED: { ...slot, reason: 'Evento privado del club' },
  RESERVATION_CANCELLED: { ...slot, cancelledBy: 'MEMBER' },
  RESOURCE_MAINTENANCE: slot,
  RESERVATION_REMINDER: { ...slot, participantCount: 4 },
};

// Patrones que jamás deben aparecer en un texto (RN-PAG-08, criterio 4).
const FORBIDDEN = [
  /pi_[A-Za-z0-9]/, // PaymentIntent de Stripe
  /pm_[A-Za-z0-9]/, // PaymentMethod de Stripe
  /sk_(test|live)/,
  /whsec_/,
  /\b\d{8}\b/, // DNI completo
  /\b\d{13,19}\b/, // número de tarjeta
  /cvv/i,
  /stripe/i,
];

describe('catálogo de eventos', () => {
  it('cubre exactamente los 13 eventos del diccionario de datos', () => {
    expect([...NOTIFICATION_EVENTS].sort()).toEqual(Object.keys(SAMPLES).sort());
    expect(NOTIFICATION_EVENTS).toHaveLength(13);
  });

  it('rechaza un evento fuera del catálogo en lugar de usar un texto genérico (criterio 3)', () => {
    expect(() =>
      renderNotification('NO_EXISTE' as unknown as NotificationEvent, {} as never, 'Ana'),
    ).toThrow(UnknownNotificationEventError);
    expect(() =>
      renderNotification('toString' as unknown as NotificationEvent, {} as never, 'Ana'),
    ).toThrow(UnknownNotificationEventError);
  });
});

describe.each(NOTIFICATION_EVENTS)('texto de %s', (event) => {
  const rendered = renderNotification(event, SAMPLES[event] as never, 'Ana');

  it('tiene título, cuerpo, asunto y cuerpo de correo en español', () => {
    expect(rendered.title.length).toBeGreaterThan(0);
    expect(rendered.body.length).toBeGreaterThan(0);
    expect(rendered.emailSubject).toBe(`Activa Club: ${rendered.title}`);
    expect(rendered.emailText).toContain('Hola Ana,');
    expect(rendered.emailText).toContain(rendered.body);
    expect(rendered.emailHtml).toContain('<html lang="es"');
  });

  it('no incluye datos sensibles ni identificadores internos', () => {
    const all = [
      rendered.title,
      rendered.body,
      rendered.emailSubject,
      rendered.emailText,
      rendered.emailHtml,
    ].join('\n');
    for (const pattern of FORBIDDEN) {
      expect(all).not.toMatch(pattern);
    }
  });
});

describe('contenido específico', () => {
  it('PAYMENT_SUCCEEDED: plan, monto en soles y vencimiento en hora de Lima', () => {
    const r = renderNotification('PAYMENT_SUCCEEDED', SAMPLES.PAYMENT_SUCCEEDED, 'Ana');
    expect(r.body).toContain('S/ 120.00');
    expect(r.body).toContain('mensual');
    // 04:59:59Z del 10 de septiembre es el 9 de septiembre 23:59 en Lima.
    expect(r.body).toContain('9 de septiembre de 2026');
  });

  it('MEMBER_APPROVED indica que debe pagar la primera membresía (RN-ACT-07)', () => {
    const r = renderNotification('MEMBER_APPROVED', {}, 'Ana');
    expect(r.body).toMatch(/paga tu primera membresía/);
  });

  it('MEMBER_REJECTED y RESERVATION_REJECTED incluyen el motivo', () => {
    expect(renderNotification('MEMBER_REJECTED', { reason: 'Falta DNI' }, 'Ana').body).toContain(
      'Falta DNI',
    );
    expect(
      renderNotification('RESERVATION_REJECTED', SAMPLES.RESERVATION_REJECTED, 'Ana').body,
    ).toContain('Evento privado del club');
  });

  it('un motivo vacío usa un texto de respaldo', () => {
    expect(renderNotification('MEMBER_REJECTED', { reason: '  ' }, 'Ana').body).toContain(
      'No se indicó un motivo.',
    );
  });

  it('RESERVATION_CANCELLED distingue cancelación del club y del socio', () => {
    const byAdmin = renderNotification(
      'RESERVATION_CANCELLED',
      { ...slot, cancelledBy: 'ADMIN' },
      'Ana',
    );
    const byMember = renderNotification(
      'RESERVATION_CANCELLED',
      { ...slot, cancelledBy: 'MEMBER' },
      'Ana',
    );
    expect(byAdmin.body).toMatch(/El club canceló/);
    expect(byMember.body).toMatch(/Cancelaste/);
  });

  it('RESOURCE_MAINTENANCE aclara que la reserva no se canceló sola', () => {
    const r = renderNotification('RESOURCE_MAINTENANCE', slot, 'Ana');
    expect(r.body).toContain('no fue cancelada automáticamente');
    expect(r.body).toContain('15 de agosto de 2026, de 14:00 a 15:00');
  });

  it('RESERVATION_REMINDER cuenta participantes sin nombres', () => {
    const one = renderNotification('RESERVATION_REMINDER', { ...slot, participantCount: 1 }, 'Ana');
    expect(one.body).toContain('1 participante.');
    expect(one.body).not.toContain('participantes');
  });

  it('RENEWAL_DUE no promete cobro automático (EP-05, US-047)', () => {
    const r = renderNotification('RENEWAL_DUE', SAMPLES.RENEWAL_DUE, 'Ana');
    expect(r.body).not.toMatch(/autom[aá]tic/i);
  });

  it('ignora propiedades extra no declaradas (no filtra datos sensibles)', () => {
    const r = renderNotification(
      'PAYMENT_SUCCEEDED',
      {
        ...SAMPLES.PAYMENT_SUCCEEDED,
        stripePaymentIntentId: 'pi_123',
        dni: '12345678',
      } as never,
      'Ana',
    );
    expect(r.body).not.toContain('pi_123');
    expect(r.body).not.toContain('12345678');
  });
});

describe('escape de HTML en el correo', () => {
  it('escapa motivo y nombre en HTML y los deja crudos en texto plano', () => {
    const r = renderNotification(
      'MEMBER_REJECTED',
      { reason: '<script>alert("x")</script> & más' },
      "<b>Ana</b> O'Neil",
    );
    expect(r.emailHtml).not.toContain('<script>');
    expect(r.emailHtml).not.toContain('<b>Ana</b>');
    expect(r.emailHtml).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; más');
    expect(r.emailHtml).toContain('O&#39;Neil');
    expect(r.emailText).toContain('<script>');
  });

  it('colapsa saltos de línea y limita la longitud de un motivo libre', () => {
    const r = renderNotification('MEMBER_REJECTED', { reason: `a\n\nb${'x'.repeat(500)}` }, 'Ana');
    expect(r.body).not.toContain('\n');
    expect(r.body.length).toBeLessThan(450);
    expect(r.body).toContain('…');
  });
});

describe('formato', () => {
  it('fechas y horas en America/Lima', () => {
    expect(formatLimaDate('2026-01-01T03:00:00.000Z')).toBe('31 de diciembre de 2025');
    expect(formatLimaTime('2026-08-15T19:05:00.000Z')).toBe('14:05');
    expect(formatLimaTime('2026-08-15T05:00:00.000Z')).toBe('00:00');
  });

  it('franja que cruza medianoche en Lima', () => {
    expect(formatLimaRange('2026-08-16T03:00:00.000Z', '2026-08-16T07:00:00.000Z')).toBe(
      'del 15 de agosto de 2026 a las 22:00 al 16 de agosto de 2026 a las 02:00',
    );
  });

  it('montos en soles', () => {
    expect(formatSoles(0)).toBe('S/ 0.00');
    expect(formatSoles(12_005)).toBe('S/ 120.05');
    expect(() => formatSoles(-1)).toThrow(RangeError);
    expect(() => formatSoles(1.5)).toThrow(RangeError);
  });

  it('fecha inválida es error de programación', () => {
    expect(() => formatLimaDate('no-es-fecha')).toThrow(RangeError);
  });

  it('escapeHtml', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});
