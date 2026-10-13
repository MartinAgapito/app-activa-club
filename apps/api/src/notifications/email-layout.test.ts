import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { NotificationEvent } from '@activa-club/shared-types';

import { FOOTER_TEXT, renderEmailLayout, safeAppUrl } from './email-layout';
import { renderPublishedEmail } from './publish-email';
import { NOTIFICATION_EVENTS, renderNotification, type NotificationDataByEvent } from './templates';

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

afterEach(() => {
  delete process.env['APP_BASE_URL'];
});

function render(event: NotificationEvent, name = 'Ana') {
  return renderNotification(event, SAMPLES[event] as never, name);
}

describe.each(NOTIFICATION_EVENTS)('correo de marca de %s', (event) => {
  const r = render(event);

  it('tiene estructura de tablas, cabecera, título, preheader y pie', () => {
    const html = r.emailHtml;
    expect(html.startsWith('<!doctype html><html lang="es"')).toBe(true);
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('<meta name="supported-color-schemes" content="light dark">');
    expect(html).toContain('max-width:600px');
    expect(html).toContain('role="presentation"');
    expect(html).toContain('>Activa Club</span>');
    expect(html).toContain(`<h1 class="ac-ink"`);
    expect(html).toContain(`>${r.title}</h1>`);
    expect(html).toContain('display:none;max-height:0;overflow:hidden');
    expect(html).toContain(FOOTER_TEXT);
    expect(html).not.toMatch(/<img|<link|@font-face|https?:\/\/fonts\./);
  });

  it('no muestra botón sin APP_BASE_URL y el texto plano queda igual', () => {
    expect(r.emailHtml).not.toContain('class="ac-btn-link"');
    expect(r.emailText).toBe(
      `Hola Ana,\n\n${r.body}\n\nEste es un aviso automático de Activa Club.\n`,
    );
    expect(r.emailSubject).toBe(`Activa Club: ${r.title}`);
  });

  it('muestra el botón y el enlace en texto plano con APP_BASE_URL', () => {
    process.env['APP_BASE_URL'] = 'https://app.activa.test';
    const withUrl = render(event);
    expect(withUrl.emailHtml).toContain('class="ac-btn-link" href="https://app.activa.test/"');
    expect(withUrl.emailText).toContain('Ingresa a Activa Club: https://app.activa.test/');
    expect(withUrl.emailSubject).toBe(r.emailSubject);
  });
});

describe('tarjeta de datos clave', () => {
  it('reserva: instalación y fecha/hora', () => {
    const html = render('RESERVATION_CONFIRMED').emailHtml;
    expect(html).toContain('ac-facts');
    expect(html).toContain('>Instalación<');
    expect(html).toContain('>Cancha de fútbol 1<');
    expect(html).toContain('>15 de agosto de 2026, de 14:00 a 15:00<');
  });

  it('pago: monto, membresía y vigencia', () => {
    const html = render('PAYMENT_SUCCEEDED').emailHtml;
    expect(html).toContain('>S/ 120.00<');
    expect(html).toContain('>Vigente hasta<');
    expect(html).toContain('>9 de septiembre de 2026<');
  });

  it('eventos sin datos clave no llevan tarjeta', () => {
    expect(render('ACCOUNT_ACTIVATED').emailHtml).not.toContain('class="ac-facts"');
    expect(render('MEMBER_APPROVED').emailHtml).not.toContain('class="ac-facts"');
  });
});

describe('escape de HTML', () => {
  it('escapa motivo, nombre y título publicado por el administrador', () => {
    const r = renderNotification(
      'MEMBER_REJECTED',
      { reason: '<script>alert("x")</script>' },
      '<b>Ana</b>',
    );
    expect(r.emailHtml).not.toContain('<script>');
    expect(r.emailHtml).not.toContain('<b>Ana</b>');
    expect(r.emailHtml).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');

    const p = renderPublishedEmail('<img src=x onerror=1>', 'Cuerpo & <i>más</i>', 'Luis');
    expect(p.html).not.toContain('<img');
    expect(p.html).not.toContain('<i>');
    expect(p.html).toContain('&lt;img src=x onerror=1&gt;');
    expect(p.html).toContain('Cuerpo &amp; &lt;i&gt;más&lt;/i&gt;');
    expect(p.html).toContain(FOOTER_TEXT);
    expect(p.subject).toBe('Activa Club: <img src=x onerror=1>');
    expect(p.text).toBe(
      'Hola Luis,\n\n<img src=x onerror=1>\n\nCuerpo & <i>más</i>\n\nEquipo Activa Club\n',
    );
  });
});

describe('renderEmailLayout y safeAppUrl', () => {
  it('arma las secciones en orden: preheader, cabecera, título, cuerpo, datos, pie', () => {
    const html = renderEmailLayout({
      preheader: 'Resumen',
      heading: 'Título',
      paragraphs: ['Hola,', 'Cuerpo'],
      facts: [{ label: 'Monto', value: 'S/ 10.00' }],
    });
    const order = [
      '>Resumen</div>',
      '>Activa Club</span>',
      '>Título</h1>',
      '>Hola,</p>',
      '>Cuerpo</p>',
      '>S/ 10.00<',
      FOOTER_TEXT,
    ];
    const positions = order.map((fragment) => html.indexOf(fragment));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('solo acepta URLs http(s) y escapa la dirección', () => {
    expect(safeAppUrl(undefined)).toBeUndefined();
    expect(safeAppUrl('')).toBeUndefined();
    expect(safeAppUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeAppUrl('no es url')).toBeUndefined();
    expect(safeAppUrl('https://app.test')).toBe('https://app.test/');
    const html = renderEmailLayout({
      preheader: 'p',
      heading: 'h',
      paragraphs: [],
      appUrl: 'javascript:alert(1)',
    });
    expect(html).not.toContain('class="ac-btn-link"');
  });

  it('el preheader se recorta y escapa', () => {
    const html = renderEmailLayout({
      preheader: `<x>${'a'.repeat(300)}`,
      heading: 'h',
      paragraphs: [],
    });
    expect(html).toContain('&lt;x&gt;aaa');
    expect(html).toContain('…</div>');
  });
});

// Vista previa manual: `EMAIL_PREVIEW_DIR=<carpeta> pnpm --filter @activa-club/api exec vitest run
// src/notifications/email-layout.test.ts`. Sin la variable no escribe nada. La carpeta debe
// quedar fuera del repositorio (p. ej. la temporal del sistema).
describe.skipIf(!process.env['EMAIL_PREVIEW_DIR'])('vista previa en disco', () => {
  it('escribe un HTML de ejemplo por evento y uno de publicación', () => {
    const dir = process.env['EMAIL_PREVIEW_DIR'] ?? join(tmpdir(), 'activa-club-email-preview');
    mkdirSync(dir, { recursive: true });
    process.env['APP_BASE_URL'] = 'https://app.activa.test';
    for (const event of NOTIFICATION_EVENTS) {
      writeFileSync(join(dir, `${event}.html`), render(event).emailHtml, 'utf-8');
    }
    const p = renderPublishedEmail(
      'Cierre por mantenimiento',
      'La piscina estará cerrada el sábado.\n\nGracias por tu comprensión.',
      'Ana',
    );
    writeFileSync(join(dir, 'PUBLICACION.html'), p.html, 'utf-8');
    expect(true).toBe(true);
  });
});
