// Utilidades puras de formato para los textos de notificación (US-040).
//
// Fechas y horas en `America/Lima` (docs/data/diccionario-de-datos.md §3);
// montos en soles a partir de céntimos. Sin dependencia de ICU del runtime
// para los nombres: los meses se resuelven con una tabla propia para que los
// textos sean deterministas en cualquier entorno (Lambda, CI, laptop).

const LIMA_TIME_ZONE = 'America/Lima';

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const limaFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

interface LimaParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function limaParts(iso: string): LimaParts {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Fecha ISO inválida: ${iso}`);
  }
  const parts = limaFormatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
  };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `2026-08-15T19:00:00.000Z` -> `15 de agosto de 2026` (hora de Lima). */
export function formatLimaDate(iso: string): string {
  const p = limaParts(iso);
  return `${p.day} de ${MONTHS_ES[p.month - 1]} de ${p.year}`;
}

/** `2026-08-15T19:00:00.000Z` -> `14:00` (hora de Lima, 24 h). */
export function formatLimaTime(iso: string): string {
  const p = limaParts(iso);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Franja de una reserva o bloqueo. Mismo día en Lima: `15 de agosto de 2026,
 * de 14:00 a 15:00`; días distintos: `del 15 de agosto de 2026 a las 22:00 al
 * 16 de agosto de 2026 a las 02:00`.
 */
export function formatLimaRange(startsAtIso: string, endsAtIso: string): string {
  const startDate = formatLimaDate(startsAtIso);
  const endDate = formatLimaDate(endsAtIso);
  const start = formatLimaTime(startsAtIso);
  const end = formatLimaTime(endsAtIso);
  if (startDate === endDate) {
    return `${startDate}, de ${start} a ${end}`;
  }
  return `del ${startDate} a las ${start} al ${endDate} a las ${end}`;
}

/** Céntimos -> `S/ 120.00` (enteros en céntimos, moneda PEN). */
export function formatSoles(amountCents: number): string {
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new RangeError(`Monto en céntimos inválido: ${amountCents}`);
  }
  const soles = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  return `S/ ${soles}.${pad2(cents)}`;
}

/** Escapa los caracteres con significado en HTML (texto y atributos). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normaliza y limita un texto libre (motivos escritos por una persona). */
export function cleanFreeText(value: string, maxLength = 300): string {
  const collapsed = value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
    : collapsed;
}
