// Métricas de reservas y ocupación de `GET /dashboard/admin` (US-058,
// docs/api/contratos-api.md §9 y §12, ADR-0014; RN-ANL-03/04/07).
//
// Este módulo NO es un handler: devuelve solo las secciones del contrato que
// pertenecen a US-058 (`periods`, `reservationsByResource`, `reservationsByDay`,
// `reservationsByHour`, `occupancy`). El handler compartido
// (`handlers/dashboard/admin.ts`) las compone con las de US-057.
//
// Patrón de acceso (sin `Scan`, IAM de solo lectura GetItem + Query):
//   - catálogo: 10 `GetItem` por `resourceId` (`CATALOG_RESOURCE_IDS`), nunca el
//     `Scan` de `GET /resources`;
//   - por recurso (en paralelo): (a) `Query` GSI3PK=`RESOURCE#<id>` con
//     `GSI3SK BETWEEN SLOT#<from> AND SLOT#<to>` (patrón #21) y (b) `Query`
//     tabla base PK=`RESOURCE#<id>`, `begins_with(SK,"MAINT#")` +
//     `FilterExpression endsAt > :from` (patrón #30).
//   Total: 10 GetItem + 20 Query (más páginas si una Query supera 1 MB).
//
// Todos los días y horas se calculan en `America/Lima` (UTC-5, sin horario de
// verano): ver `../reservations/time.ts`.

import { QueryCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  DashboardPeriod,
  DashboardPeriods,
  OccupancyEntry,
  Reservation,
  ReservationsByDayEntry,
  ReservationsByHourEntry,
  Resource,
} from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { isActiveReservationStatus } from '../reservations/reservation-status';
import { CLUB_TIME_ZONE, limaCalendarDate, limaWallTimeToUtc } from '../reservations/time';
import { getResourceById } from '../resources/repository';
import { CATALOG_RESOURCE_IDS } from '../resources/catalog';

/** Días de la ventana `last30Days` (hoy y los 29 anteriores). */
export const LAST_DAYS_WINDOW = 30;

const MS_PER_HOUR = 3_600_000;

/** Sección de `GET /dashboard/admin` que calcula esta historia. */
export interface AdminReservationMetrics {
  periods: DashboardPeriods;
  reservationsByResource: Record<string, number>;
  reservationsByDay: ReservationsByDayEntry[];
  reservationsByHour: ReservationsByHourEntry[];
  occupancy: OccupancyEntry[];
}

export interface GetAdminReservationMetricsInput {
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
  /** Instante de referencia inyectable ("ahora"), para pruebas deterministas. */
  now?: Date;
  /** Identificadores del catálogo; por defecto los diez fijos (ADR-0010). */
  resourceIds?: readonly string[];
}

// --- Funciones puras de calendario y aritmética ---

/** Suma `days` (puede ser negativo) a una fecha `YYYY-MM-DD` sin depender de la zona. */
export function addDaysToDate(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** `HH:mm` -> instante UTC de ese día local; admite `24:00` (medianoche del día siguiente). */
function wallTimeMs(dateOnly: string, time: string): number {
  if (time === '24:00') return limaWallTimeToUtc(addDaysToDate(dateOnly, 1), '00:00').getTime();
  return limaWallTimeToUtc(dateOnly, time).getTime();
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return hour * 60 + minute;
}

/** Ventana `last30Days`: `[hoy − 29 días 00:00, mañana 00:00)` en Lima, expresada en UTC. */
export function computeLast30DaysPeriod(now: Date): DashboardPeriod {
  const today = limaCalendarDate(now);
  return {
    from: limaWallTimeToUtc(addDaysToDate(today, -(LAST_DAYS_WINDOW - 1)), '00:00').toISOString(),
    to: limaWallTimeToUtc(addDaysToDate(today, 1), '00:00').toISOString(),
    timeZone: CLUB_TIME_ZONE,
  };
}

/** Ventana `currentMonth`: día 1 del mes en curso 00:00 → día 1 del mes siguiente (Lima, en UTC). */
export function computeCurrentMonthPeriod(now: Date): DashboardPeriod {
  const today = limaCalendarDate(now);
  const [year, month] = today.split('-').map(Number) as [number, number];
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const nextFirst = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return {
    from: limaWallTimeToUtc(first, '00:00').toISOString(),
    to: limaWallTimeToUtc(nextFirst, '00:00').toISOString(),
    timeZone: CLUB_TIME_ZONE,
  };
}

/** Ambos períodos del contrato (el handler compartido lo reutiliza para US-057). */
export function computePeriods(now: Date): DashboardPeriods {
  return {
    currentMonth: computeCurrentMonthPeriod(now),
    last30Days: computeLast30DaysPeriod(now),
  };
}

/** Redondea a `decimals` decimales evitando el error binario típico (p. ej. 0.00625 -> 0.0063). */
function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * `occupancyRate = reservedHours / operatingHours`, acotado a `[0, 1]` y
 * redondeado a 4 decimales; `0` si no hay horas operativas (nunca división por
 * cero).
 */
export function computeOccupancyRate(reservedHours: number, operatingHours: number): number {
  if (!(operatingHours > 0) || !(reservedHours > 0)) return 0;
  return roundTo(Math.min(1, reservedHours / operatingHours), 4);
}

interface Interval {
  start: number;
  end: number;
}

/** Une intervalos solapados o contiguos (resultado ordenado y disjunto). */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** Milisegundos de `[start, end)` cubiertos por `merged` (intervalos ya disjuntos). */
export function coveredMs(start: number, end: number, merged: readonly Interval[]): number {
  let total = 0;
  for (const block of merged) {
    const overlap = Math.min(end, block.end) - Math.max(start, block.start);
    if (overlap > 0) total += overlap;
  }
  return total;
}

const limaPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLUB_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
});

/** Fecha (`YYYY-MM-DD`) y hora (0-23) locales de Lima de un instante. */
export function limaDateAndHour(at: Date): { date: string; hour: number } {
  const parts = limaPartsFormatter.formatToParts(at);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

// --- Cálculo por recurso (sin AWS) ---

export interface MetricsReservation {
  startsAt: string;
  endsAt: string;
}

export interface ResourceOccupancyInput {
  resourceId: string;
  /** Horario vigente `HH:mm`; `undefined` si el recurso no está en el catálogo cargado. */
  opensAt?: string;
  closesAt?: string;
  /** Reservas activas con `startsAt` dentro de la ventana. */
  reservations: readonly MetricsReservation[];
  /** Bloqueos de mantenimiento que alcanzan la ventana (pueden empezar antes). */
  blocks: readonly MetricsReservation[];
}

/**
 * Horas operativas y reservadas de un recurso (RN-ANL-07), ya redondeadas a 2
 * decimales, más la tasa de ocupación.
 */
export function computeResourceOccupancy(
  input: ResourceOccupancyInput,
  days: readonly string[],
  period: { fromMs: number; toMs: number },
): OccupancyEntry {
  const merged = mergeIntervals(
    input.blocks.map((block) => ({
      start: Math.max(Date.parse(block.startsAt), period.fromMs),
      end: Math.min(Date.parse(block.endsAt), period.toMs),
    })),
  );

  let operatingMs = 0;
  if (input.opensAt && input.closesAt) {
    for (const day of days) {
      const open = wallTimeMs(day, input.opensAt);
      const close = wallTimeMs(day, input.closesAt);
      if (close > open) operatingMs += close - open - coveredMs(open, close, merged);
    }
  }

  let reservedMs = 0;
  for (const reservation of input.reservations) {
    const start = Date.parse(reservation.startsAt);
    const end = Date.parse(reservation.endsAt);
    if (end > start) reservedMs += end - start - coveredMs(start, end, merged);
  }

  const operatingHours = operatingMs / MS_PER_HOUR;
  const reservedHours = reservedMs / MS_PER_HOUR;
  return {
    resourceId: input.resourceId,
    occupancyRate: computeOccupancyRate(reservedHours, operatingHours),
    reservedHours: roundTo(Math.max(0, reservedHours), 2),
    operatingHours: roundTo(Math.max(0, operatingHours), 2),
  };
}

/**
 * Rango de horas de inicio del catálogo: desde la hora del `opensAt` más
 * temprano hasta la hora previa al `closesAt` más tardío (06:00 a 21:00 con el
 * catálogo actual). `observedHours` amplía el rango si alguna reserva (p. ej. de
 * un horario anterior del recurso) cae fuera, para mantener
 * `Σ reservationsByHour = Σ reservationsByResource`.
 */
export function computeHourRange(
  schedules: readonly { opensAt: string; closesAt: string }[],
  observedHours: Iterable<number> = [],
): { first: number; last: number } | undefined {
  const hours: number[] = [...observedHours];
  for (const schedule of schedules) {
    hours.push(Math.floor(timeToMinutes(schedule.opensAt) / 60));
    hours.push(Math.ceil(timeToMinutes(schedule.closesAt) / 60) - 1);
  }
  if (hours.length === 0) return undefined;
  return { first: Math.min(...hours), last: Math.max(...hours) };
}

// --- Lectura DynamoDB ---

interface RawItem {
  entityType?: string;
  reservationStatus?: Reservation['reservationStatus'];
  startsAt?: string;
  endsAt?: string;
}

/** `Query` paginada completa de una partición/rango (cada recurso es acotado: ver cabecera). */
async function queryAll(
  client: DynamoDBDocumentClient,
  input: ConstructorParameters<typeof QueryCommand>[0],
): Promise<RawItem[]> {
  const items: RawItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new QueryCommand({ ...input, ExclusiveStartKey: exclusiveStartKey }),
    );
    for (const item of result.Items ?? []) items.push(item as RawItem);
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

/** Patrón #21: reservas del recurso con `startsAt` en `[from, to)`, solo activas. */
async function fetchActiveReservations(
  client: DynamoDBDocumentClient,
  resourceId: string,
  period: DashboardPeriod,
): Promise<MetricsReservation[]> {
  const items = await queryAll(client, {
    TableName: tableName(),
    IndexName: 'GSI3',
    KeyConditionExpression: 'GSI3PK = :pk AND GSI3SK BETWEEN :lo AND :hi',
    FilterExpression: 'entityType = :reservation',
    ProjectionExpression: 'startsAt, endsAt, reservationStatus',
    ExpressionAttributeValues: {
      ':pk': keys.reservationsByResource(resourceId).GSI3PK,
      ':lo': `SLOT#${period.from}`,
      ':hi': `SLOT#${period.to}`,
      ':reservation': 'Reservation',
    },
  });
  const fromMs = Date.parse(period.from);
  const toMs = Date.parse(period.to);
  const result: MetricsReservation[] = [];
  for (const item of items) {
    if (!item.startsAt || !item.endsAt || !item.reservationStatus) continue;
    if (!isActiveReservationStatus(item.reservationStatus)) continue;
    const startMs = Date.parse(item.startsAt);
    // La comparación lexicográfica de GSI3SK puede dejar pasar bordes con
    // distinto formato de milisegundos: el filtro exacto es este.
    if (!(startMs >= fromMs && startMs < toMs)) continue;
    result.push({ startsAt: item.startsAt, endsAt: item.endsAt });
  }
  return result;
}

/** Patrón #30: bloqueos del recurso con `endsAt > from` (incluye los que empezaron antes). */
async function fetchMaintenanceBlocks(
  client: DynamoDBDocumentClient,
  resourceId: string,
  period: DashboardPeriod,
): Promise<MetricsReservation[]> {
  const items = await queryAll(client, {
    TableName: tableName(),
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    FilterExpression: 'endsAt > :from',
    ProjectionExpression: 'startsAt, endsAt',
    ExpressionAttributeValues: {
      ':pk': keys.resource(resourceId).PK,
      ':prefix': 'MAINT#',
      ':from': period.from,
    },
  });
  return items
    .filter((item) => item.startsAt && item.endsAt)
    .map((item) => ({ startsAt: item.startsAt as string, endsAt: item.endsAt as string }));
}

async function loadResource(
  client: DynamoDBDocumentClient,
  resourceId: string,
  period: DashboardPeriod,
): Promise<{
  resourceId: string;
  resource: Resource | undefined;
  reservations: MetricsReservation[];
  blocks: MetricsReservation[];
}> {
  const [resource, reservations, blocks] = await Promise.all([
    getResourceById(client, resourceId),
    fetchActiveReservations(client, resourceId, period),
    fetchMaintenanceBlocks(client, resourceId, period),
  ]);
  return { resourceId, resource, reservations, blocks };
}

/**
 * Calcula las métricas de reservas y ocupación de `GET /dashboard/admin`
 * (criterios 1-11 de US-058). Solo lecturas; ninguna respuesta incluye datos
 * personales (solo cantidades, horas y proporciones).
 */
export async function getAdminReservationMetrics(
  input: GetAdminReservationMetricsInput = {},
): Promise<AdminReservationMetrics> {
  const client = input.client ?? getDocumentClient();
  const now = input.now ?? new Date();
  const resourceIds = input.resourceIds ?? CATALOG_RESOURCE_IDS;

  const periods = computePeriods(now);
  const window = periods.last30Days;
  const fromMs = Date.parse(window.from);
  const toMs = Date.parse(window.to);

  const today = limaCalendarDate(now);
  const days = Array.from({ length: LAST_DAYS_WINDOW }, (_, index) =>
    addDaysToDate(today, index - (LAST_DAYS_WINDOW - 1)),
  );

  const loaded = await Promise.all(resourceIds.map((id) => loadResource(client, id, window)));

  const byResource: Record<string, number> = {};
  const byDay = new Map<string, number>(days.map((day) => [day, 0]));
  const byHour = new Map<number, number>();
  const occupancy: OccupancyEntry[] = [];
  const schedules: { opensAt: string; closesAt: string }[] = [];

  for (const entry of loaded) {
    byResource[entry.resourceId] = entry.reservations.length;
    for (const reservation of entry.reservations) {
      const { date, hour } = limaDateAndHour(new Date(reservation.startsAt));
      byDay.set(date, (byDay.get(date) ?? 0) + 1);
      byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
    }
    const opensAt = entry.resource?.opensAt;
    const closesAt = entry.resource?.closesAt;
    if (opensAt && closesAt) schedules.push({ opensAt, closesAt });
    occupancy.push(
      computeResourceOccupancy(
        {
          resourceId: entry.resourceId,
          ...(opensAt && closesAt ? { opensAt, closesAt } : {}),
          reservations: entry.reservations,
          blocks: entry.blocks,
        },
        days,
        { fromMs, toMs },
      ),
    );
  }

  const range = computeHourRange(schedules, byHour.keys());
  const reservationsByHour: ReservationsByHourEntry[] = [];
  if (range) {
    for (let hour = range.first; hour <= range.last; hour += 1) {
      reservationsByHour.push({ hour: hourLabel(hour), count: byHour.get(hour) ?? 0 });
    }
  }

  return {
    periods,
    reservationsByResource: byResource,
    reservationsByDay: days.map((date) => ({ date, count: byDay.get(date) ?? 0 })),
    reservationsByHour,
    occupancy,
  };
}
