import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Fakes en memoria: el repositorio reproduce la semántica del rango GSI3
// (semiabierto [from, to) sobre `startsAt`) y del filtro de estado; el motor
// de notificaciones reproduce la deduplicación por (evento, socio, hecho).
interface FakeReservation {
  reservationId: string;
  resourceId: string;
  holderMemberId: string;
  startsAt: string;
  endsAt: string;
  reservationStatus: string;
  participantCount: number;
}

const store = {
  resources: new Map<string, { resourceId: string; name: string; resourceStatus: string }>(),
  reservations: [] as FakeReservation[],
  members: new Map<string, { memberId: string; email: string | null; firstName: string }>(),
  failResourceGet: new Set<string>(),
  failResourceQuery: new Set<string>(),
  failMemberGet: new Set<string>(),
  failEmitFor: new Set<string>(),
  inboxFailedFor: new Set<string>(),
  dedupe: new Set<string>(),
  queries: [] as Array<{ resourceId: string; from: string; to: string }>,
  emitted: [] as Array<Record<string, unknown>>,
};

vi.mock('../resources/repository', () => ({
  getResourceById: vi.fn(async (_c: unknown, resourceId: string) => {
    if (store.failResourceGet.has(resourceId)) throw new Error('get resource exploded');
    return store.resources.get(resourceId);
  }),
}));

vi.mock('./remind-repository', () => ({
  listRemindableReservations: vi.fn(
    async (_c: unknown, resourceId: string, window: { from: string; to: string }) => {
      store.queries.push({ resourceId, ...window });
      if (store.failResourceQuery.has(resourceId)) throw new Error('query exploded');
      return store.reservations.filter(
        (r) =>
          r.resourceId === resourceId &&
          r.startsAt >= window.from &&
          r.startsAt < window.to &&
          ['CONFIRMED', 'APPROVED'].includes(r.reservationStatus),
      );
    },
  ),
  getReminderRecipient: vi.fn(async (_c: unknown, memberId: string) => {
    if (store.failMemberGet.has(memberId)) throw new Error('member get exploded');
    return store.members.get(memberId) ?? null;
  }),
}));

vi.mock('../notifications', () => ({
  emitNotification: vi.fn(async (input: Record<string, unknown>) => {
    const member = input['member'] as { memberId: string };
    const entityId = input['entityId'] as string;
    if (store.failEmitFor.has(entityId)) throw new TypeError('bad data');
    if (store.inboxFailedFor.has(entityId)) {
      return { inbox: 'FAILED', email: 'SKIPPED', notificationId: 'x' };
    }
    const key = `${input['event']}#${member.memberId}#${entityId}`;
    if (store.dedupe.has(key)) return { inbox: 'DUPLICATE', email: 'SKIPPED', notificationId: key };
    store.dedupe.add(key);
    store.emitted.push(input);
    return { inbox: 'WRITTEN', email: 'SENT', notificationId: key };
  }),
}));

const loggerMock = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
vi.mock('../lib/logger', () => ({ logger: loggerMock }));

const { remindReservations } = await import('./remind-reservations');
const { CATALOG_RESOURCE_IDS } = await import('../resources/catalog');

const client = {} as DynamoDBDocumentClient;
// 18:00 en Lima del 10-jul-2026 (23:00 UTC).
const NOW = new Date('2026-07-10T23:00:00.000Z');

let seq = 0;
function addReservation(overrides: Partial<FakeReservation> = {}): FakeReservation {
  seq += 1;
  const reservation: FakeReservation = {
    reservationId: `res-${seq}`,
    resourceId: 'futbol-1',
    holderMemberId: 'm-1',
    startsAt: '2026-07-11T14:00:00.000Z',
    endsAt: '2026-07-11T15:30:00.000Z',
    reservationStatus: 'CONFIRMED',
    participantCount: 4,
    ...overrides,
  };
  store.reservations.push(reservation);
  return reservation;
}

describe('remindReservations (US-046)', () => {
  beforeEach(() => {
    seq = 0;
    store.resources.clear();
    store.reservations = [];
    store.members.clear();
    store.failResourceGet.clear();
    store.failResourceQuery.clear();
    store.failMemberGet.clear();
    store.failEmitFor.clear();
    store.inboxFailedFor.clear();
    store.dedupe.clear();
    store.queries = [];
    store.emitted = [];
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
    for (const id of CATALOG_RESOURCE_IDS) {
      store.resources.set(id, {
        resourceId: id,
        name: `Recurso ${id}`,
        resourceStatus: 'AVAILABLE',
      });
    }
    store.members.set('m-1', { memberId: 'm-1', email: 'ana@club.pe', firstName: 'Ana' });
    store.members.set('m-2', { memberId: 'm-2', email: null, firstName: 'Beto' });
  });

  it('recuerda al titular de una reserva confirmada de mañana con el dato esperado', async () => {
    const r = addReservation();

    const summary = await remindReservations({ client, now: NOW, requestId: 'req-1' });

    expect(summary).toEqual({
      targetDateLima: '2026-07-11',
      resources: 10,
      evaluated: 1,
      sent: 1,
      duplicated: 0,
      errors: 0,
    });
    expect(store.emitted).toHaveLength(1);
    expect(store.emitted[0]).toMatchObject({
      event: 'RESERVATION_REMINDER',
      entityId: r.reservationId,
      member: { memberId: 'm-1', firstName: 'Ana' },
      data: {
        resourceName: 'Recurso futbol-1',
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        participantCount: 4,
      },
    });
  });

  it('la ventana consultada es el día calendario siguiente de Lima, en UTC, por cada recurso', async () => {
    await remindReservations({ client, now: NOW });

    expect(store.queries).toHaveLength(10);
    expect(store.queries.map((q) => q.resourceId)).toEqual([...CATALOG_RESOURCE_IDS]);
    for (const q of store.queries) {
      expect(q.from).toBe('2026-07-11T05:00:00.000Z');
      expect(q.to).toBe('2026-07-12T05:00:00.000Z');
    }
  });

  describe('bordes de la zona horaria de Lima', () => {
    it('incluye 00:00, 00:30 y 23:30 Lima de mañana (esta última cae en el día UTC siguiente)', async () => {
      const a = addReservation({ startsAt: '2026-07-11T05:00:00.000Z' }); // 00:00 Lima
      const b = addReservation({ startsAt: '2026-07-11T05:30:00.000Z' }); // 00:30 Lima
      const c = addReservation({ startsAt: '2026-07-12T04:30:00.000Z' }); // 23:30 Lima, 12-jul UTC

      const summary = await remindReservations({ client, now: NOW });

      expect(summary.sent).toBe(3);
      expect(store.emitted.map((e) => e['entityId']).sort()).toEqual(
        [a, b, c].map((r) => r.reservationId).sort(),
      );
    });

    it('excluye 23:30 Lima de hoy (11-jul UTC) y 00:00 Lima de pasado mañana', async () => {
      addReservation({ startsAt: '2026-07-11T04:30:00.000Z' }); // 23:30 Lima del 10-jul
      addReservation({ startsAt: '2026-07-12T05:00:00.000Z' }); // 00:00 Lima del 12-jul
      addReservation({ startsAt: '2026-07-12T14:00:00.000Z' }); // pasado mañana

      const summary = await remindReservations({ client, now: NOW });

      expect(summary.evaluated).toBe(0);
      expect(store.emitted).toHaveLength(0);
    });

    it('a las 06:00 Lima de mañana (11:00 UTC) se incluye', async () => {
      addReservation({ startsAt: '2026-07-11T11:00:00.000Z' });

      expect((await remindReservations({ client, now: NOW })).sent).toBe(1);
    });

    it('usa la fecha de Lima y no la de UTC: a las 23:30 Lima de hoy el "mañana" sigue siendo el 11', async () => {
      // 04:30 UTC del 11-jul = 23:30 Lima del 10-jul.
      const summary = await remindReservations({
        client,
        now: new Date('2026-07-11T04:30:00.000Z'),
      });

      expect(summary.targetDateLima).toBe('2026-07-11');
    });

    it('pasada la medianoche de Lima el objetivo avanza un día', async () => {
      // 05:00 UTC del 11-jul = 00:00 Lima del 11-jul.
      const summary = await remindReservations({
        client,
        now: new Date('2026-07-11T05:00:00.000Z'),
      });

      expect(summary.targetDateLima).toBe('2026-07-12');
    });

    it('cruce de mes y de año', async () => {
      const dec = await remindReservations({
        client,
        now: new Date('2026-12-31T23:00:00.000Z'),
      });
      expect(dec.targetDateLima).toBe('2027-01-01');
      expect(store.queries.at(-1)).toMatchObject({
        from: '2027-01-01T05:00:00.000Z',
        to: '2027-01-02T05:00:00.000Z',
      });
    });
  });

  describe('estados', () => {
    it('recuerda CONFIRMED y APPROVED', async () => {
      addReservation({ reservationStatus: 'CONFIRMED' });
      addReservation({ reservationStatus: 'APPROVED', resourceId: 'parrilla-1' });

      expect((await remindReservations({ client, now: NOW })).sent).toBe(2);
    });

    it.each(['PENDING_APPROVAL', 'CANCELLED', 'REJECTED'])(
      'no recuerda una reserva %s',
      async (reservationStatus) => {
        addReservation({ reservationStatus });

        const summary = await remindReservations({ client, now: NOW });

        expect(summary.evaluated).toBe(0);
        expect(summary.sent).toBe(0);
        expect(store.emitted).toHaveLength(0);
      },
    );

    it('una reserva cancelada tras el recordatorio no genera un segundo aviso', async () => {
      const r = addReservation();
      await remindReservations({ client, now: NOW });
      r.reservationStatus = 'CANCELLED';

      const second = await remindReservations({ client, now: NOW });

      expect(second.evaluated).toBe(0);
      expect(store.emitted).toHaveLength(1);
    });

    it('un recurso en mantenimiento igual recibe el recordatorio', async () => {
      store.resources.get('tenis-1')!.resourceStatus = 'MAINTENANCE';
      addReservation({ resourceId: 'tenis-1' });

      const summary = await remindReservations({ client, now: NOW });

      expect(summary.sent).toBe(1);
      expect(summary.errors).toBe(0);
    });
  });

  describe('idempotencia', () => {
    it('una doble ejecución el mismo día deja un solo recordatorio por reserva', async () => {
      addReservation();
      addReservation({ resourceId: 'padel-2', holderMemberId: 'm-2' });

      const first = await remindReservations({ client, now: NOW });
      const second = await remindReservations({ client, now: NOW });

      expect(first).toMatchObject({ evaluated: 2, sent: 2, duplicated: 0 });
      expect(second).toMatchObject({ evaluated: 2, sent: 0, duplicated: 2, errors: 0 });
      expect(store.emitted).toHaveLength(2);
    });

    it('un reintento tras un error parcial solo completa lo que faltaba', async () => {
      addReservation({ resourceId: 'futbol-1' });
      addReservation({ resourceId: 'tenis-1' });
      store.failResourceQuery.add('tenis-1');

      const first = await remindReservations({ client, now: NOW });
      store.failResourceQuery.clear();
      const retry = await remindReservations({ client, now: NOW });

      expect(first).toMatchObject({ sent: 1, errors: 1 });
      expect(retry).toMatchObject({ sent: 1, duplicated: 1, errors: 0 });
      expect(store.emitted).toHaveLength(2);
    });

    it('el titular con varias reservas recibe un aviso por reserva (entityId = reservationId)', async () => {
      addReservation({ resourceId: 'futbol-1' });
      addReservation({ resourceId: 'tenis-1', startsAt: '2026-07-11T16:00:00.000Z' });

      const summary = await remindReservations({ client, now: NOW });

      expect(summary.sent).toBe(2);
    });
  });

  describe('tolerancia a errores', () => {
    it('0 reservas: resumen en cero y log de éxito', async () => {
      const summary = await remindReservations({ client, now: NOW, requestId: 'req-0' });

      expect(summary).toEqual({
        targetDateLima: '2026-07-11',
        resources: 10,
        evaluated: 0,
        sent: 0,
        duplicated: 0,
        errors: 0,
      });
      expect(loggerMock.info).toHaveBeenCalledWith(
        'reservation reminder run completed',
        expect.objectContaining({ outcome: 'SUCCESS', requestId: 'req-0', evaluated: 0 }),
      );
    });

    it('un recurso cuya consulta falla no detiene a los demás', async () => {
      addReservation({ resourceId: 'futbol-1' });
      addReservation({ resourceId: 'tenis-1' });
      addReservation({ resourceId: 'salon-social' });
      store.failResourceQuery.add('tenis-1');

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ evaluated: 2, sent: 2, errors: 1 });
      expect(loggerMock.error).toHaveBeenCalledWith(
        'resource reminder evaluation failed',
        expect.objectContaining({ resourceId: 'tenis-1', errorName: 'Error' }),
      );
    });

    it('un recurso cuyo GetItem falla cuenta como error y el lote sigue', async () => {
      addReservation({ resourceId: 'padel-1' });
      store.failResourceGet.add('futbol-1');

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ sent: 1, errors: 1 });
    });

    it('un recurso ausente del catálogo se omite con advertencia, sin error', async () => {
      store.resources.delete('piscina-1');
      addReservation({ resourceId: 'futbol-1' });

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ sent: 1, errors: 0 });
      expect(loggerMock.warn).toHaveBeenCalledWith(
        'catalog resource not found',
        expect.objectContaining({ resourceId: 'piscina-1' }),
      );
    });

    it('una reserva cuya emisión lanza no detiene a las demás de ese recurso', async () => {
      const bad = addReservation();
      addReservation({ startsAt: '2026-07-11T17:00:00.000Z' });
      store.failEmitFor.add(bad.reservationId);

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ evaluated: 2, sent: 1, errors: 1 });
    });

    it('bandeja FAILED cuenta como error (el reintento la completará)', async () => {
      const bad = addReservation();
      store.inboxFailedFor.add(bad.reservationId);

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ sent: 0, errors: 1 });
    });

    it('titular inexistente o con lectura fallida cuenta como error y el lote continúa', async () => {
      addReservation({ holderMemberId: 'm-missing' });
      addReservation({ holderMemberId: 'm-boom', startsAt: '2026-07-11T16:00:00.000Z' });
      addReservation({ holderMemberId: 'm-1', startsAt: '2026-07-11T18:00:00.000Z' });
      store.failMemberGet.add('m-boom');

      const summary = await remindReservations({ client, now: NOW });

      expect(summary).toMatchObject({ evaluated: 3, sent: 1, errors: 2 });
      expect(loggerMock.info).toHaveBeenCalledWith(
        'reservation reminder run completed',
        expect.objectContaining({ outcome: 'FAILURE', errors: 2 }),
      );
    });

    it('no registra correo ni nombres en los logs de error', async () => {
      addReservation({ holderMemberId: 'm-1' });
      store.failEmitFor.add('res-1');

      await remindReservations({ client, now: NOW });

      const serialized = JSON.stringify(loggerMock.error.mock.calls);
      expect(serialized).not.toContain('ana@club.pe');
      expect(serialized).not.toContain('Ana');
    });
  });

  it('el correo del titular sin email igual se entrega a la bandeja', async () => {
    addReservation({ holderMemberId: 'm-2' });

    const summary = await remindReservations({ client, now: NOW });

    expect(summary.sent).toBe(1);
    expect(store.emitted[0]).toMatchObject({ member: { email: null, firstName: 'Beto' } });
  });

  it('usa la hora actual cuando no se inyecta now', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const summary = await remindReservations({ client });
      expect(summary.targetDateLima).toBe('2026-07-11');
    } finally {
      vi.useRealTimers();
    }
  });
});
