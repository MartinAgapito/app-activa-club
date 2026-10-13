// Plantilla HTML de marca de los correos transaccionales (EP-05, US-040/US-048).
//
// Módulo puro: recibe contenido ya redactado y lo envuelve en un diseño de
// correo robusto (tablas, CSS en línea, 600 px máx., sin fuentes web ni
// imágenes externas). Todo texto pasa por `escapeHtml`. Los colores son los
// tokens de marca v2.0 del frontend (apps/web/src/styles/theme.css) como
// valores literales: un correo no puede leer variables CSS.
//
// Modo oscuro: se declaran `color-scheme`/`supported-color-schemes` y un bloque
// `prefers-color-scheme: dark` con las mismas clases; los clientes que ignoran
// <style> (Gmail app, Outlook) conservan el diseño claro con fondos explícitos.

import { escapeHtml } from './format';

/** Nombre visible de la marca (cabecera del correo y del remitente). */
export const BRAND_NAME = 'Activa Club';

export const FOOTER_TEXT =
  'Recibes este correo porque tienes una cuenta en Activa Club. Este es un mensaje automático; no respondas a esta dirección.';

const COLORS = {
  pageBg: '#f3f5f9', // surface-app
  cardBg: '#ffffff', // surface-card
  headerBg: '#1b2e5e', // brand-700
  headerText: '#ffffff',
  ink: '#13203b',
  inkMuted: '#566280',
  line: '#dde3ee',
  factsBg: '#e9eefa', // surface-brand-soft
  action: '#243d7a', // brand-600
  actionText: '#ffffff',
} as const;

const FONT_STACK = "Arial, 'Helvetica Neue', Helvetica, 'Segoe UI', sans-serif";
const DISPLAY_STACK = "'Arial Narrow', 'Segoe UI', Arial, 'Helvetica Neue', Helvetica, sans-serif";

export interface EmailFact {
  label: string;
  value: string;
}

export interface EmailLayoutInput {
  /** Resumen oculto que muestran las bandejas junto al asunto. */
  preheader: string;
  /** Título del bloque principal. */
  heading: string;
  /** Párrafos del cuerpo (el primero suele ser el saludo). */
  paragraphs: readonly string[];
  /** Tarjeta opcional de datos clave. */
  facts?: readonly EmailFact[];
  /** Línea final discreta (despedida). */
  closing?: string;
  /** URL base de la app: si falta o no es http(s), no hay botón. */
  appUrl?: string | undefined;
  ctaLabel?: string;
}

/** Devuelve la URL normalizada si es http(s) válida; `undefined` si no. */
export function safeAppUrl(raw: string | undefined): string | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function preheaderText(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > 140 ? `${flat.slice(0, 139).trimEnd()}…` : flat;
}

function paragraphHtml(text: string): string {
  return (
    `<p class="ac-ink" style="margin:0 0 16px 0;font-family:${FONT_STACK};font-size:16px;line-height:24px;` +
    `color:${COLORS.ink};white-space:pre-line;">${escapeHtml(text)}</p>`
  );
}

function factsHtml(facts: readonly EmailFact[]): string {
  const rows = facts
    .map(
      (fact) =>
        `<tr><td class="ac-muted" style="padding:4px 0;font-family:${FONT_STACK};font-size:13px;line-height:18px;color:${COLORS.inkMuted};">${escapeHtml(fact.label)}</td></tr>` +
        `<tr><td class="ac-ink" style="padding:0 0 10px 0;font-family:${FONT_STACK};font-size:16px;line-height:22px;font-weight:bold;color:${COLORS.ink};">${escapeHtml(fact.value)}</td></tr>`,
    )
    .join('');
  return (
    `<table role="presentation" class="ac-facts" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `bgcolor="${COLORS.factsBg}" style="background-color:${COLORS.factsBg};border-radius:8px;margin:0 0 20px 0;">` +
    `<tr><td style="padding:14px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>` +
    `</table>`
  );
}

function buttonHtml(url: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px 0;"><tr>` +
    `<td class="ac-btn" bgcolor="${COLORS.action}" style="background-color:${COLORS.action};border-radius:6px;">` +
    `<a class="ac-btn-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;` +
    `font-family:${FONT_STACK};font-size:16px;line-height:20px;font-weight:bold;color:${COLORS.actionText};text-decoration:none;">` +
    `${escapeHtml(label)}</a></td></tr></table>`
  );
}

const DARK_CSS =
  '@media (prefers-color-scheme: dark){' +
  '.ac-page{background-color:#0d1830 !important;}' +
  '.ac-card{background-color:#142347 !important;}' +
  '.ac-ink{color:#eef2fb !important;}' +
  '.ac-muted{color:#aec1eb !important;}' +
  '.ac-facts{background-color:#1b2e5e !important;}' +
  '.ac-btn{background-color:#85a2e0 !important;}' +
  '.ac-btn-link{color:#0d1830 !important;}' +
  '.ac-line{border-color:#243d7a !important;}' +
  '}';

/** Envuelve el contenido en la plantilla de marca y devuelve el documento HTML. */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const url = safeAppUrl(input.appUrl);
  const body = input.paragraphs.map(paragraphHtml).join('');
  const facts = input.facts && input.facts.length > 0 ? factsHtml(input.facts) : '';
  const button = url ? buttonHtml(url, input.ctaLabel ?? `Abrir ${BRAND_NAME}`) : '';
  const closing = input.closing
    ? `<p class="ac-muted" style="margin:0;font-family:${FONT_STACK};font-size:14px;line-height:20px;color:${COLORS.inkMuted};">${escapeHtml(input.closing)}</p>`
    : '';

  return (
    `<!doctype html><html lang="es" xmlns="http://www.w3.org/1999/xhtml"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="color-scheme" content="light dark">` +
    `<meta name="supported-color-schemes" content="light dark">` +
    `<title>${escapeHtml(input.heading)}</title>` +
    `<style>:root{color-scheme:light dark;supported-color-schemes:light dark;}${DARK_CSS}</style>` +
    `</head>` +
    `<body class="ac-page" bgcolor="${COLORS.pageBg}" style="margin:0;padding:0;background-color:${COLORS.pageBg};">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLORS.pageBg};">` +
    `${escapeHtml(preheaderText(input.preheader))}</div>` +
    `<table role="presentation" class="ac-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.pageBg}" style="background-color:${COLORS.pageBg};">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">` +
    // Cabecera de marca
    `<tr><td bgcolor="${COLORS.headerBg}" style="background-color:${COLORS.headerBg};padding:18px 24px;border-radius:8px 8px 0 0;">` +
    `<span style="font-family:${DISPLAY_STACK};font-size:22px;line-height:26px;font-weight:bold;letter-spacing:1px;color:${COLORS.headerText};">${escapeHtml(BRAND_NAME)}</span>` +
    `</td></tr>` +
    // Tarjeta de contenido
    `<tr><td class="ac-card" bgcolor="${COLORS.cardBg}" style="background-color:${COLORS.cardBg};padding:28px 24px 20px 24px;">` +
    `<h1 class="ac-ink" style="margin:0 0 20px 0;font-family:${DISPLAY_STACK};font-size:26px;line-height:32px;font-weight:bold;color:${COLORS.ink};">${escapeHtml(input.heading)}</h1>` +
    `${body}${facts}${button}${closing}` +
    `</td></tr>` +
    // Pie
    `<tr><td class="ac-card ac-line" bgcolor="${COLORS.cardBg}" style="background-color:${COLORS.cardBg};padding:16px 24px 20px 24px;border-top:1px solid ${COLORS.line};border-radius:0 0 8px 8px;">` +
    `<p class="ac-muted" style="margin:0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${COLORS.inkMuted};">${escapeHtml(FOOTER_TEXT)}</p>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
