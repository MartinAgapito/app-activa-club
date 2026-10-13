// Período del dashboard del administrador en hora de Lima (US-059).
//
// El servidor entrega ventanas semiabiertas `[from, to)` en UTC; el último día
// incluido es el instante anterior a `to`.

import type { DashboardPeriod } from '@activa-club/shared-types';

const LIMA = 'America/Lima';

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: LIMA, ...options }).format(date);
}

/** "1 al 31 de octubre de 2026" (ventana en hora de Lima). */
export function formatPeriodRange(period: DashboardPeriod): string {
  const start = new Date(period.from);
  const end = new Date(new Date(period.to).getTime() - 1);
  const startDay = format(start, { day: 'numeric' });
  const startMonth = format(start, { month: 'long', year: 'numeric' });
  const endDay = format(end, { day: 'numeric' });
  const endMonth = format(end, { month: 'long', year: 'numeric' });
  return startMonth === endMonth
    ? `${startDay} al ${endDay} de ${endMonth}`
    : `${startDay} de ${startMonth} al ${endDay} de ${endMonth}`;
}
