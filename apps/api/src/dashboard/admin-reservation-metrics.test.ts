import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import {
  addDaysToDate,
  computeHourRange,
  computeLast30DaysPeriod,
  computeOccupancyRate,
  computePeriods,
  computeResourceOccupancy,
  coveredMs,
  getAdminReservationMetrics,
  limaDateAndHour,
  mergeIntervals,
} from './admin-reservation-metrics';

// "Ahora" = 2026-10-12 12:00 en Lima.
const NOW = new Date('2026-10-12T17:00:00.000Z');

describe('periodos', () => {
  it('last30Days es [hoy-29 00:00, mañana 00:00) de Lima expresado en UTC', () => {
    expect(computeLast30DaysPeriod(NOW)).toEqual({
      from: '2026-09-13T05:00:00.000Z',
      to: '2026-10-13T05:00:00.000Z',
      timeZone: 'America/Lima',
    });
  });

  it('currentMonth va del día 1 al día 1 del mes siguiente (Lima)', () => {
    expect(computePeriods(NOW).currentMonth).toEqual({
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-11-01T05:00:00.000Z',
      timeZone: 'America/Lima',
    });
  });

  it('currentMonth cruza el año en diciembre', () => {
    const december = new Date('2026-12-15T17:00:00.000Z');
    expect(computePeriods(december).currentMonth).toEqual({
      from: '2026-12-01T05:00:00.000Z',
      to: '2027-01-01T05:00:00.000Z',
      timeZone: 'America/Lima',
    });
  });

  it('usa el día de Lima: 22:00 Lima (03:00Z del día siguiente) sigue siendo "hoy"', () => {
    const lateNight = new Date('2026-10-13T03:00:00.000Z');
    expect(computeLast30DaysPeriod(lateNight).to).toBe('2026-10-13T05:00:00.000Z');
    const afterMidnight = new Date('2026-10-13T05:00:00.000Z');
    expect(computeLast30DaysPeriod(afterMidnight).to).toBe('2026-10-14T05:00:00.000Z');
  });

  it('addDaysToDate cruza meses y años', () => {
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('computeOccupancyRate', () => {
  it('2 horas reservadas sobre 10 operativas = 0.2', () => {
    expect(computeOccupancyRate(2, 10)).toBe(0.2);
  });

  it('3 sobre 480 se redondea a 4 decimales (0.0063)', () => {
    expect(computeOccupancyRate(3, 480)).toBe(0.0063);
  });

  it('sin horas operativas devuelve 0 (sin división por cero)', () => {
    expect(computeOccupancyRate(5, 0)).toBe(0);
  });

  it('se acota a 1', () => {
    expect(computeOccupancyRate(12, 10)).toBe(1);
  });
});

describe('intervalos', () => {
  it('mergeIntervals une solapados y contiguos y descarta vacíos', () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 15, end: 30 },
        { start: 30, end: 40 },
        { start: 50, end: 50 },
        { start: 60, end: 70 },
      ]),
    ).toEqual([
      { start: 10, end: 40 },
      { start: 60, end: 70 },
    ]);
  });

  it('coveredMs mide la parte solapada', () => {
    expect(coveredMs(0, 100, [{ start: 20, end: 50 }])).toBe(30);
    expect(coveredMs(0, 10, [{ start: 20, end: 50 }])).toBe(0);
  });
});

describe('computeHourRange', () => {
  it('va de la hora del opensAt más temprano a la previa al closesAt más tardío', () => {
    expect(
      computeHourRange([
        { opensAt: '06:00', closesAt: '22:00' },
        { opensAt: '08:00', closesAt: '20:30' },
      ]),
    ).toEqual({ first: 6, last: 21 });
  });

  it('closesAt con minutos incluye su hora parcial', () => {
    expect(computeHourRange([{ opensAt: '06:30', closesAt: '22:30' }])).toEqual({
      first: 6,
      last: 22,
    });
  });

  it('se amplía con horas observadas fuera del catálogo', () => {
    expect(computeHourRange([{ opensAt: '06:00', closesAt: '22:00' }], [5, 23])).toEqual({
      first: 5,
      last: 23,
    });
  });
});

describe('limaDateAndHour', () => {
  it('07:30 Lima cuenta en la hora 7 y la medianoche pertenece al día nuevo', () => {
    expect(limaDateAndHour(new Date('2026-10-02T12:30:00.000Z'))).toEqual({
      date: '2026-10-02',
      hour: 7,
    });
    expect(limaDateAndHour(new Date('2026-10-02T04:59:00.000Z'))).toEqual({
      date: '2026-10-01',
      hour: 23,
    });
    expect(limaDateAndHour(new Date('2026-10-02T05:00:00.000Z'))).toEqual({
      date: '2026-10-02',
      hour: 0,
    });
  });
});

describe('computeResourceOccupancy', () => {
  const days = ['2026-10-01', '2026-10-02'];
  const period = {
    fromMs: Date.parse('2026-10-01T05:00:00.000Z'),
    toMs: Date.parse('2026-10-03T05:00:00.000Z'),
  };

  it('suma el horario vigente de cada día y las reservas', () => {
    const entry = computeResourceOccupancy(
      {
        resourceId: 'futbol-1',
        opensAt: '06:00',
        closesAt: '22:00',
        reservations: [
          { startsAt: '2026-10-01T11:00:00.000Z', endsAt: '2026-10-01T12:30:00.000Z' },
        ],
        blocks: [],
      },
      days,
      period,
    );
    expect(entry).toEqual({
      resourceId: 'futbol-1',
      occupancyRate: computeOccupancyRate(1.5, 32),
      reservedHours: 1.5,
      operatingHours: 32,
    });
  });

  it('descuenta bloqueos de las horas operativas, aunque empiecen antes de la ventana', () => {
    const entry = computeResourceOccupancy(
      {
        resourceId: 'futbol-1',
        opensAt: '06:00',
        closesAt: '22:00',
        reservations: [],
        // Del 2026-09-30 00:00 Lima al 2026-10-01 12:00 Lima: cubre 06-12 del día 1.
        blocks: [{ startsAt: '2026-09-30T05:00:00.000Z', endsAt: '2026-10-01T17:00:00.000Z' }],
      },
      days,
      period,
    );
    expect(entry.operatingHours).toBe(26);
  });

  it('un bloqueo que cubre todo el periodo da 0 horas y tasa 0', () => {
    const entry = computeResourceOccupancy(
      {
        resourceId: 'futbol-1',
        opensAt: '06:00',
        closesAt: '22:00',
        reservations: [
          { startsAt: '2026-10-01T11:00:00.000Z', endsAt: '2026-10-01T12:30:00.000Z' },
        ],
        blocks: [{ startsAt: '2026-09-01T05:00:00.000Z', endsAt: '2026-11-01T05:00:00.000Z' }],
      },
      days,
      period,
    );
    expect(entry).toEqual({
      resourceId: 'futbol-1',
      occupancyRate: 0,
      reservedHours: 0,
      operatingHours: 0,
    });
  });

  it('la parte de una reserva solapada con un bloqueo no suma a reservedHours', () => {
    const entry = computeResourceOccupancy(
      {
        resourceId: 'futbol-1',
        opensAt: '06:00',
        closesAt: '22:00',
        reservations: [
          { startsAt: '2026-10-01T11:00:00.000Z', endsAt: '2026-10-01T12:30:00.000Z' },
        ],
        // 06:00-07:00 Lima.
        blocks: [{ startsAt: '2026-10-01T11:00:00.000Z', endsAt: '2026-10-01T12:00:00.000Z' }],
      },
      days,
      period,
    );
    expect(entry.reservedHours).toBe(0.5);
    expect(entry.operatingHours).toBe(31);
  });

  it('bloqueos solapados entre sí no se descuentan dos veces', () => {
    const entry = computeResourceOccupancy(
      {
        resourceId: 'futbol-1',
        opensAt: '06:00',
        closesAt: '22:00',
        reservations: [],
        blocks: [
          { startsAt: '2026-10-01T11:00:00.000Z', endsAt: '2026-10-01T13:00:00.000Z' },
          { startsAt: '2026-10-01T12:00:00.000Z', endsAt: '2026-10-01T14:00:00.000Z' },
        ],
      },
      days,
      period,
    );
    expect(entry.operatingHours).toBe(29);
  });

  it('un recurso sin horario (catálogo no cargado) tiene 0 horas operativas', () => {
    const entry = computeResourceOccupancy(
      { resourceId: 'x', reservations: [], blocks: [] },
      days,
      period,
    );
    expect(entry.operatingHours).toBe(0);
    expect(entry.occupancyRate).toBe(0);
  });
});

// --- Orquestador con un cliente DynamoDB falso (solo GetItem y Query) ---

interface FakeReservation {
  startsAt: string;
  endsAt: string;
  reservationStatus: string;
}
interface FakeBlock {
  startsAt: string;
  endsAt: string;
}

interface FakeInput {
  Key: { PK: string };
  IndexName?: string;
  KeyConditionExpression?: string;
  ExclusiveStartKey?: number;
  ExpressionAttributeValues: Record<string, string>;
}

function buildFakeClient(data: {
  resources: Record<string, { opensAt: string; closesAt: string }>;
  reservations?: Record<string, FakeReservation[]>;
  blocks?: Record<string, FakeBlock[]>;
  pageSize?: number;
}) {
  const commands: { name: string; input: FakeInput }[] = [];

  function page<T>(items: T[], startKey: unknown) {
    const size = data.pageSize ?? Number.MAX_SAFE_INTEGER;
    const start = typeof startKey === 'number' ? startKey : 0;
    const slice = items.slice(start, start + size);
    const next = start + size < items.length ? start + size : undefined;
    return { Items: slice, LastEvaluatedKey: next };
  }

  const client = {
    send: vi.fn(async (command: { constructor: { name: string }; input: unknown }) => {
      const name = command.constructor.name;
      const input = command.input as FakeInput;
      commands.push({ name, input });

      if (name === 'GetCommand') {
        const resourceId = String(input.Key.PK).replace('RESOURCE#', '');
        const resource = data.resources[resourceId];
        return { Item: resource ? { ...input.Key, resourceId, ...resource } : undefined };
      }

      if (name === 'QueryCommand' && input.IndexName === 'GSI3') {
        const resourceId = String(input.ExpressionAttributeValues[':pk']).replace('RESOURCE#', '');
        const lo = input.ExpressionAttributeValues[':lo'] as string;
        const hi = input.ExpressionAttributeValues[':hi'] as string;
        const items = (data.reservations?.[resourceId] ?? [])
          .map((r, index) => ({
            ...r,
            entityType: 'Reservation',
            GSI3SK: `SLOT#${r.startsAt}#res-${index}`,
          }))
          .filter((r) => r.GSI3SK >= lo && r.GSI3SK <= hi);
        // Un MaintenanceBlock también aparece en GSI3: el filtro entityType lo descarta.
        return page(items, input.ExclusiveStartKey);
      }

      if (name === 'QueryCommand' && !input.IndexName) {
        const resourceId = String(input.ExpressionAttributeValues[':pk']).replace('RESOURCE#', '');
        const from = input.ExpressionAttributeValues[':from'] as string;
        const items = (data.blocks?.[resourceId] ?? []).filter((b) => b.endsAt > from);
        return page(items, input.ExclusiveStartKey);
      }

      throw new Error(`Comando no permitido por el IAM de solo lectura: ${name}`);
    }),
  };

  return { client: client as unknown as DynamoDBDocumentClient, commands };
}

const catalog = {
  'futbol-1': { opensAt: '06:00', closesAt: '22:00' },
  'tenis-1': { opensAt: '06:00', closesAt: '22:00' },
  'parrilla-1': { opensAt: '10:00', closesAt: '22:00' },
};
const IDS = ['futbol-1', 'tenis-1', 'parrilla-1'];

describe('getAdminReservationMetrics', () => {
  beforeEach(() => {
    vi.stubEnv('DYNAMODB_TABLE_NAME', 'activa-test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DA-09: dos reservas de 90 min sin mantenimiento dan 3 h / 480 h / 0.0063', async () => {
    const { client } = buildFakeClient({
      resources: catalog,
      reservations: {
        'futbol-1': [
          {
            startsAt: '2026-10-01T11:00:00.000Z',
            endsAt: '2026-10-01T12:30:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
          {
            startsAt: '2026-10-02T12:30:00.000Z',
            endsAt: '2026-10-02T14:00:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
        ],
      },
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.occupancy.find((o) => o.resourceId === 'futbol-1')).toEqual({
      resourceId: 'futbol-1',
      reservedHours: 3,
      operatingHours: 480,
      occupancyRate: 0.0063,
    });
  });

  it('cuenta por recurso (con ceros), por día (30 entradas) y por hora, y las sumas coinciden', async () => {
    const { client } = buildFakeClient({
      resources: catalog,
      reservations: {
        'futbol-1': [
          {
            startsAt: '2026-10-01T11:00:00.000Z', // 06:00 Lima
            endsAt: '2026-10-01T12:30:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
          {
            startsAt: '2026-10-02T12:30:00.000Z', // 07:30 Lima
            endsAt: '2026-10-02T14:00:00.000Z',
            reservationStatus: 'APPROVED',
          },
        ],
        'tenis-1': [
          {
            startsAt: '2026-10-02T12:00:00.000Z', // 07:00 Lima
            endsAt: '2026-10-02T13:00:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
          {
            startsAt: '2026-10-03T12:00:00.000Z',
            endsAt: '2026-10-03T13:00:00.000Z',
            reservationStatus: 'CANCELLED',
          },
          {
            startsAt: '2026-10-04T12:00:00.000Z',
            endsAt: '2026-10-04T13:00:00.000Z',
            reservationStatus: 'REJECTED',
          },
        ],
      },
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.reservationsByResource).toEqual({ 'futbol-1': 2, 'tenis-1': 1, 'parrilla-1': 0 });
    expect(result.reservationsByDay).toHaveLength(30);
    expect(result.reservationsByDay[0]).toEqual({ date: '2026-09-13', count: 0 });
    expect(result.reservationsByDay[29]).toEqual({ date: '2026-10-12', count: 0 });
    expect(result.reservationsByDay.find((d) => d.date === '2026-10-01')?.count).toBe(1);
    expect(result.reservationsByDay.find((d) => d.date === '2026-10-02')?.count).toBe(2);

    expect(result.reservationsByHour).toHaveLength(16);
    expect(result.reservationsByHour[0]).toEqual({ hour: '06:00', count: 1 });
    expect(result.reservationsByHour[1]).toEqual({ hour: '07:00', count: 2 });
    expect(result.reservationsByHour[15]).toEqual({ hour: '21:00', count: 0 });

    const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
    const byResource = sum(Object.values(result.reservationsByResource));
    expect(sum(result.reservationsByDay.map((d) => d.count))).toBe(byResource);
    expect(sum(result.reservationsByHour.map((h) => h.count))).toBe(byResource);
  });

  it('excluye reservas con startsAt fuera de la ventana (borde superior exclusivo)', async () => {
    const { client } = buildFakeClient({
      resources: catalog,
      reservations: {
        'futbol-1': [
          {
            startsAt: '2026-10-13T05:00:00.000Z', // exactamente `to`
            endsAt: '2026-10-13T06:30:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
          {
            startsAt: '2026-09-13T05:00:00.000Z', // exactamente `from`: entra
            endsAt: '2026-09-13T06:30:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
        ],
      },
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.reservationsByResource['futbol-1']).toBe(1);
    expect(result.reservationsByDay[0]).toEqual({ date: '2026-09-13', count: 1 });
  });

  it('descuenta un bloqueo que empezó antes de la ventana (patrón #30)', async () => {
    const { client } = buildFakeClient({
      resources: catalog,
      blocks: {
        // Del 2026-09-12 00:00 Lima al 2026-09-14 00:00 Lima: afecta solo el 13.
        'futbol-1': [{ startsAt: '2026-09-12T05:00:00.000Z', endsAt: '2026-09-14T05:00:00.000Z' }],
      },
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.occupancy.find((o) => o.resourceId === 'futbol-1')?.operatingHours).toBe(464);
    expect(result.occupancy.find((o) => o.resourceId === 'tenis-1')?.operatingHours).toBe(480);
    expect(result.occupancy.find((o) => o.resourceId === 'parrilla-1')?.operatingHours).toBe(360);
  });

  it('recorre las páginas de una Query paginada', async () => {
    const reservations = Array.from({ length: 5 }, (_, index) => ({
      startsAt: `2026-10-0${index + 1}T11:00:00.000Z`,
      endsAt: `2026-10-0${index + 1}T12:30:00.000Z`,
      reservationStatus: 'CONFIRMED',
    }));
    const { client } = buildFakeClient({
      resources: catalog,
      reservations: { 'futbol-1': reservations },
      pageSize: 2,
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.reservationsByResource['futbol-1']).toBe(5);
  });

  it('solo usa GetItem y Query (nunca Scan) con 10 GetItem + 20 Query para el catálogo completo', async () => {
    const { client, commands } = buildFakeClient({ resources: {} });

    await getAdminReservationMetrics({ client, now: NOW });

    const names = commands.map((c) => c.name);
    expect(names.filter((n) => n === 'GetCommand')).toHaveLength(10);
    expect(names.filter((n) => n === 'QueryCommand')).toHaveLength(20);
    expect(names.every((n) => n === 'GetCommand' || n === 'QueryCommand')).toBe(true);
    const gsi3 = commands.find((c) => c.input.IndexName === 'GSI3');
    expect(gsi3?.input.KeyConditionExpression).toContain('GSI3SK BETWEEN');
    expect((gsi3?.input.ExpressionAttributeValues as Record<string, string>)[':lo']).toBe(
      'SLOT#2026-09-13T05:00:00.000Z',
    );
  });

  it('con catálogo vacío devuelve ceros y sin datos personales', async () => {
    const { client } = buildFakeClient({ resources: {} });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.reservationsByResource).toEqual({ 'futbol-1': 0, 'tenis-1': 0, 'parrilla-1': 0 });
    expect(result.reservationsByHour).toEqual([]);
    expect(result.occupancy).toHaveLength(3);
    expect(JSON.stringify(result)).not.toMatch(/member|dni|holder/i);
  });

  it('una reserva fuera del rango horario del catálogo amplía reservationsByHour', async () => {
    const { client } = buildFakeClient({
      resources: catalog,
      reservations: {
        'futbol-1': [
          {
            startsAt: '2026-10-01T10:00:00.000Z', // 05:00 Lima (horario anterior del recurso)
            endsAt: '2026-10-01T11:00:00.000Z',
            reservationStatus: 'CONFIRMED',
          },
        ],
      },
    });

    const result = await getAdminReservationMetrics({ client, now: NOW, resourceIds: IDS });

    expect(result.reservationsByHour[0]).toEqual({ hour: '05:00', count: 1 });
  });
});
