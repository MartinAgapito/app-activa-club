import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createMaintenanceBlock } = await import('./maintenance');
const { updateResource } = await import('./update');
const { notifyAffectedReservations, MAX_NOTIFIED, TIME_BUDGET_MS } =
  await import('./maintenance-notify');

type Item = Record<string, unknown>;

interface CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

/**
 * Almacén en memoria: Get/Put/Update, Query GSI3 y `TransactWriteItems` con
 * `attribute_not_exists(PK)` (bandeja de US-040). Permite inyectar fallos.
 */
function buildStore(
  initial: Item[],
  options: { failMemberGet?: Set<string>; failTransact?: boolean } = {},
) {
  const items = new Map<string, Item>();
  const keyOf = (pk: unknown, sk: unknown) => `${String(pk)}|${String(sk)}`;
  for (const item of initial) items.set(keyOf(item['PK'], item['SK']), { ...item });
  const memberGets: string[] = [];

  const conditional = () =>
    Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' });

  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const input = cmd.input;
    switch (cmd.constructor.name) {
      case 'GetCommand': {
        const key = input['Key'] as Item;
        const pk = String(key['PK']);
        if (pk.startsWith('MEMBER#')) {
          memberGets.push(pk);
          if (options.failMemberGet?.has(pk)) throw new Error('throttled');
        }
        const item = items.get(keyOf(key['PK'], key['SK']));
        return item ? { Item: item } : {};
      }
      case 'PutCommand': {
        const item = input['Item'] as Item;
        items.set(keyOf(item['PK'], item['SK']), item);
        return {};
      }
      case 'UpdateCommand': {
        const key = input['Key'] as Item;
        const current = items.get(keyOf(key['PK'], key['SK']));
        if (!current) throw conditional();
        const names = (input['ExpressionAttributeNames'] ?? {}) as Record<string, string>;
        const values = (input['ExpressionAttributeValues'] ?? {}) as Item;
        for (const [placeholder, attribute] of Object.entries(names)) {
          current[attribute] = values[`:${placeholder.slice(1)}`];
        }
        return { Attributes: { ...current } };
      }
      case 'QueryCommand': {
        const values = input['ExpressionAttributeValues'] as Item;
        return { Items: [...items.values()].filter((i) => i['GSI3PK'] === values[':pk']) };
      }
      case 'TransactWriteCommand': {
        if (options.failTransact) throw new Error('dynamo down');
        const transact = input['TransactItems'] as { Put: { Item: Item } }[];
        const keys = transact.map((t) => keyOf(t.Put.Item['PK'], t.Put.Item['SK']));
        if (keys.some((k) => items.has(k))) {
          throw Object.assign(new Error('cancelled'), {
            name: 'TransactionCanceledException',
            CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
          });
        }
        transact.forEach((t, i) => items.set(keys[i] as string, t.Put.Item));
        return {};
      }
      default:
        throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
    }
  });

  const inbox = () =>
    [...items.values()].filter((i) => i['entityType'] === 'MemberNotification') as Item[];

  return { items, send, memberGets, inbox, client: { send } as unknown as DynamoDBDocumentClient };
}

const futbol1: Item = {
  PK: 'RESOURCE#futbol-1',
  SK: 'METADATA',
  entityType: 'Resource',
  resourceId: 'futbol-1',
  type: 'FUTBOL',
  name: 'Cancha de fútbol 1',
  capacity: 14,
  blockMinutes: 90,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

function member(id: string): Item {
  return {
    PK: `MEMBER#${id}`,
    SK: 'PROFILE',
    entityType: 'Member',
    memberId: id,
    firstName: `Socio ${id}`,
    email: `${id}@example.com`,
  };
}

/** Reserva el día `day` de julio de 2026, a las 11:00 UTC (06:00 Lima). */
function reservation(
  id: string,
  holder: string,
  options: { status?: string; day?: number; hour?: number } = {},
): Item {
  const day = String(options.day ?? 12).padStart(2, '0');
  const hour = String(options.hour ?? 11).padStart(2, '0');
  const startsAt = `2026-07-${day}T${hour}:00:00.000Z`;
  const endsAt = new Date(new Date(startsAt).getTime() + 90 * 60_000).toISOString();
  return {
    PK: `RESERVATION#${id}`,
    SK: 'METADATA',
    GSI3PK: 'RESOURCE#futbol-1',
    GSI3SK: `SLOT#${startsAt}#${id}`,
    entityType: 'Reservation',
    reservationId: id,
    resourceId: 'futbol-1',
    resourceType: 'FUTBOL',
    holderMemberId: holder,
    startsAt,
    endsAt,
    reservationStatus: options.status ?? 'CONFIRMED',
    participantCount: 1,
    guestCount: 0,
    requiresApproval: false,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

const actor = { actorId: 'admin-1', actorRole: 'admin' as const };
const now = new Date('2026-07-01T10:00:00.000Z');
const window = { startsAt: '2026-07-12T00:00:00.000Z', endsAt: '2026-07-13T00:00:00.000Z' };

function createBlock(client: DynamoDBDocumentClient, blockId = 'block-1') {
  return createMaintenanceBlock({
    resourceId: 'futbol-1',
    ...window,
    actor,
    client,
    now,
    blockId,
    requestId: 'req-1',
  });
}

describe('createMaintenanceBlock avisa a los socios afectados (US-045)', () => {
  it('criterio 5: sin reservas afectadas no emite avisos', async () => {
    const store = buildStore([futbol1, member('m1')]);

    const result = await createBlock(store.client);

    expect(result.affectedReservationCount).toBe(0);
    expect(store.inbox()).toHaveLength(0);
    expect(store.memberGets).toHaveLength(0);
  });

  it('criterios 1 y 3: una reserva afectada avisa a su titular con la franja de la reserva', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1')]);

    const result = await createBlock(store.client);

    expect(result.affectedReservationCount).toBe(1);
    const inbox = store.inbox();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      memberId: 'm1',
      event: 'RESOURCE_MAINTENANCE',
      readStatus: 'UNREAD',
    });
    expect(String(inbox[0]?.['body'])).toContain('Cancha de fútbol 1');
    expect(String(inbox[0]?.['body'])).toContain('no fue cancelada');
  });

  it('criterios 1 y 4: N reservas afectadas, un aviso por reserva; el número coincide con affectedReservationCount', async () => {
    const store = buildStore([
      futbol1,
      member('m1'),
      member('m2'),
      reservation('r1', 'm1', { hour: 11 }),
      reservation('r2', 'm1', { hour: 14 }),
      reservation('r3', 'm2', { hour: 16, status: 'PENDING_APPROVAL' }),
      reservation('r4', 'm2', { hour: 18, status: 'APPROVED' }),
    ]);

    const result = await createBlock(store.client);

    expect(result.affectedReservationCount).toBe(4);
    expect(store.inbox()).toHaveLength(4);
    // Un GetItem por titular distinto, no por reserva.
    expect(store.memberGets.sort()).toEqual(['MEMBER#m1', 'MEMBER#m2']);
  });

  it('criterio 6: reservas canceladas, rechazadas o fuera de la ventana no avisan', async () => {
    const store = buildStore([
      futbol1,
      member('m1'),
      reservation('r1', 'm1', { status: 'CANCELLED' }),
      reservation('r2', 'm1', { status: 'REJECTED', hour: 14 }),
      reservation('r3', 'm1', { day: 20 }),
    ]);

    const result = await createBlock(store.client);

    expect(result.affectedReservationCount).toBe(0);
    expect(store.inbox()).toHaveLength(0);
  });

  it('criterio 8: si la bandeja falla, el bloqueo se crea y la respuesta no cambia', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1')], {
      failTransact: true,
    });

    const result = await createBlock(store.client);

    expect(result).toMatchObject({ blockId: 'block-1', affectedReservationCount: 1 });
    expect(store.items.has(`RESOURCE#futbol-1|MAINT#${window.startsAt}#block-1`)).toBe(true);
    expect(store.inbox()).toHaveLength(0);
  });

  it('fallo parcial: si falla la lectura de un titular, los demás avisos se emiten igual', async () => {
    const store = buildStore(
      [
        futbol1,
        member('m1'),
        member('m2'),
        reservation('r1', 'm1', { hour: 11 }),
        reservation('r2', 'm2', { hour: 14 }),
      ],
      { failMemberGet: new Set(['MEMBER#m1']) },
    );

    const result = await createBlock(store.client);

    expect(result.affectedReservationCount).toBe(2);
    expect(store.inbox().map((i) => i['memberId'])).toEqual(['m2']);
  });

  it('idempotencia: reintentar el mismo hecho no duplica los avisos', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1')]);
    const reservations = [reservation('r1', 'm1')] as never;

    await notifyAffectedReservations({
      client: store.client,
      resourceName: 'Cancha de fútbol 1',
      reservations,
      factId: 'block-1',
      now: now.toISOString(),
    });
    const second = await notifyAffectedReservations({
      client: store.client,
      resourceName: 'Cancha de fútbol 1',
      reservations,
      factId: 'block-1',
      now: new Date('2026-07-01T10:05:00.000Z').toISOString(),
    });

    expect(store.inbox()).toHaveLength(1);
    expect(second).toMatchObject({ written: 0, duplicate: 1, failed: 0 });
  });

  it('dos bloqueos distintos sobre la misma reserva generan dos avisos (un hecho cada uno)', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1')]);

    await createBlock(store.client, 'block-1');
    // Bloqueo con ventana distinta (mismo día) para tener otra clave de bloqueo.
    await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: '2026-07-12T10:00:00.000Z',
      endsAt: '2026-07-12T13:00:00.000Z',
      actor,
      client: store.client,
      now,
      blockId: 'block-2',
    });

    expect(store.inbox()).toHaveLength(2);
  });
});

describe('notifyAffectedReservations (límites)', () => {
  it('avisa primero las más próximas y registra las omitidas por encima del máximo', async () => {
    const total = MAX_NOTIFIED + 5;
    const rows: Item[] = [futbol1, member('m1')];
    for (let i = 0; i < total; i += 1) {
      rows.push(reservation(`r${String(i).padStart(3, '0')}`, 'm1', { day: 10 + (i % 15) }));
    }
    const store = buildStore(rows);
    const reservations = rows.filter((r) => r['entityType'] === 'Reservation') as never;

    const result = await notifyAffectedReservations({
      client: store.client,
      resourceName: 'Cancha de fútbol 1',
      reservations,
      factId: 'block-1',
      now: now.toISOString(),
    });

    expect(result.attempted).toBe(MAX_NOTIFIED);
    expect(result.omitted).toBe(5);
    expect(store.inbox()).toHaveLength(MAX_NOTIFIED);
  });

  it('deja de lanzar avisos al agotar el presupuesto de tiempo', async () => {
    const rows: Item[] = [
      futbol1,
      member('m1'),
      reservation('r1', 'm1', { hour: 11 }),
      reservation('r2', 'm1', { hour: 14 }),
    ];
    const store = buildStore(rows);
    const reservations = rows.filter((r) => r['entityType'] === 'Reservation') as never;
    let t = 0;
    const clock = vi.fn(() => {
      t += TIME_BUDGET_MS + 1;
      return t;
    });

    const result = await notifyAffectedReservations({
      client: store.client,
      resourceName: 'Cancha de fútbol 1',
      reservations,
      factId: 'block-1',
      now: now.toISOString(),
      clock,
    });

    expect(result.attempted).toBe(0);
    expect(result.omitted).toBe(2);
  });
});

describe('updateResource avisa al pasar a MAINTENANCE (US-045, criterios 2 y 7)', () => {
  const futureNow = new Date('2026-07-11T12:00:00.000Z');

  it('criterio 2/6: avisa solo a los titulares de reservas activas futuras', async () => {
    const store = buildStore([
      futbol1,
      member('m1'),
      member('m2'),
      reservation('r-past', 'm1', { day: 5 }),
      reservation('r-future', 'm1', { day: 12 }),
      reservation('r-cancelled', 'm2', { day: 13, status: 'CANCELLED' }),
      reservation('r-pending', 'm2', { day: 14, status: 'PENDING_APPROVAL' }),
    ]);

    const result = await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'MAINTENANCE' },
      actor,
      client: store.client,
      now: futureNow,
    });

    expect(result.resourceStatus).toBe('MAINTENANCE');
    const inbox = store.inbox();
    expect(inbox).toHaveLength(2);
    expect(inbox.map((i) => i['memberId']).sort()).toEqual(['m1', 'm2']);
  });

  it('criterio 7: otros estados y cambios que no son MAINTENANCE no avisan', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1', { day: 12 })]);

    await updateResource({
      resourceId: 'futbol-1',
      changes: { capacity: 10 },
      actor,
      client: store.client,
      now: futureNow,
    });
    await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'AVAILABLE' },
      actor,
      client: store.client,
      now: futureNow,
    });

    expect(store.inbox()).toHaveLength(0);
  });

  it('criterio 7: volver a AVAILABLE desde MAINTENANCE no avisa', async () => {
    const store = buildStore([
      { ...futbol1, resourceStatus: 'MAINTENANCE' },
      member('m1'),
      reservation('r1', 'm1', { day: 12 }),
    ]);

    await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'AVAILABLE' },
      actor,
      client: store.client,
      now: futureNow,
    });

    expect(store.inbox()).toHaveLength(0);
  });

  it('criterio 8: si la bandeja falla, el PATCH responde igual', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1', { day: 12 })], {
      failTransact: true,
    });

    const result = await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'MAINTENANCE' },
      actor,
      client: store.client,
      now: futureNow,
    });

    expect(result.resourceStatus).toBe('MAINTENANCE');
  });

  it('idempotencia: repetir el PATCH a MAINTENANCE (sin cambio) no duplica avisos', async () => {
    const store = buildStore([futbol1, member('m1'), reservation('r1', 'm1', { day: 12 })]);
    const call = () =>
      updateResource({
        resourceId: 'futbol-1',
        changes: { resourceStatus: 'MAINTENANCE' },
        actor,
        client: store.client,
        now: futureNow,
      });

    await call();
    await call();

    expect(store.inbox()).toHaveLength(1);
  });
});
