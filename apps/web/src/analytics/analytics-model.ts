// Transformaciones puras de la analítica (US-060): ordenar, nombrar y formatear
// las cifras de `GET /dashboard/admin` sin tocar el servidor. El backend es la
// fuente de verdad de los números; aquí solo se presentan.

import type { AdminDashboard, DashboardPeriod } from '@activa-club/shared-types';

export interface ResourceCountRow {
  resourceId: string;
  name: string;
  count: number;
}

export interface OccupancyRow {
  resourceId: string;
  name: string;
  occupancyRate: number;
  reservedHours: number;
  operatingHours: number;
}

export type ResourceNames = ReadonlyMap<string, string>;

function nameOf(names: ResourceNames, resourceId: string): string {
  return names.get(resourceId) ?? resourceId;
}

/** Reservas por instalación, de mayor a menor (empates por nombre). */
export function buildResourceRows(
  byResource: AdminDashboard['reservationsByResource'],
  names: ResourceNames,
): ResourceCountRow[] {
  return Object.entries(byResource)
    .map(([resourceId, count]) => ({ resourceId, name: nameOf(names, resourceId), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/** Ocupación por instalación, de mayor a menor. */
export function buildOccupancyRows(
  occupancy: AdminDashboard['occupancy'],
  names: ResourceNames,
): OccupancyRow[] {
  return occupancy
    .map((entry) => ({ ...entry, name: nameOf(names, entry.resourceId) }))
    .sort((a, b) => b.occupancyRate - a.occupancyRate || a.name.localeCompare(b.name, 'es'));
}

export function totalReservations(data: AdminDashboard): number {
  return Object.values(data.reservationsByResource).reduce((sum, n) => sum + n, 0);
}

const numberFormat = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('es-PE', {
  style: 'percent',
  maximumFractionDigits: 1,
});

/** `0.62` -> "62 %". */
export function formatPercent(rate: number): string {
  return percentFormat.format(rate);
}

/** `297` -> "297 h". */
export function formatHours(hours: number): string {
  return `${numberFormat.format(hours)} h`;
}

/** `2026-10-03` (día de Lima) -> "3 oct". */
export function formatDayShort(date: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(`${date}T00:00:00Z`))
    .replace('.', '');
}

const periodDay = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Ventana `[from, to)` como "13 de septiembre de 2026 al 12 de octubre de
 * 2026" en hora de Lima (el último día incluido es el anterior a `to`). */
export function formatPeriodRange(period: DashboardPeriod): string {
  const first = new Date(period.from);
  const last = new Date(new Date(period.to).getTime() - 1);
  return `${periodDay.format(first)} al ${periodDay.format(last)}`;
}

export interface Peak {
  maxValue: number;
  /** Etiquetas de los elementos con el valor máximo (vacío si todo es 0). */
  maxLabels: string[];
}

export function findPeak(items: ReadonlyArray<{ label: string; value: number }>): Peak {
  const maxValue = items.reduce((max, item) => Math.max(max, item.value), 0);
  return {
    maxValue,
    maxLabels: maxValue > 0 ? items.filter((i) => i.value === maxValue).map((i) => i.label) : [],
  };
}
