import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createMaintenanceBlock, releaseMaintenanceBlock } = await import('./maintenance');
const { findResourceOccupancy } = await import('../reservations/repository');
const { getResourceAvailability } = await import('../reservations/availability');

type Item = Record<string, unknown>;

interface CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

/**
 * DynamoDB en memoria mínimo: Get/Put/Delete por PK+SK y Query (GSI3 por
 * `GSI3PK`, o tabla base por PK + `begins_with(SK)` + filtro `blockId`).
 * Respeta `attribute_not_exists(PK)`/`attribute_exists(PK)`.
 */
function buildStore(initial: Item[] = []) {
  const items = new Map<string, Item>();
  const keyOf = (pk: unknown, sk: unknown) => `${String(pk)}|${String(sk)}`;
  for (const item of initial) items.set(keyOf(item['PK'], item['SK']), item);

  const conditionalError = () =>
    Object.assign(new Error('condition failed'), { name: 'ConditionalCheckFailedException' });

  const client = {
    send: vi.fn(async (command: unknown) => {
      const cmd = command as CommandLike;
      const input = cmd.input;
      switch (cmd.constructor.name) {
        case 'GetCommand': {
          const key = input['Key'] as Item;
          const item = items.get(keyOf(key['PK'], key['SK']));
          return item ? { Item: item } : {};
        }
        case 'PutCommand': {
          const item = input['Item'] as Item;
          const k = keyOf(item['PK'], item['SK']);
          if (input['ConditionExpression'] === 'attribute_not_exists(PK)' && items.has(k)) {
            throw conditionalError();
          }
          items.set(k, item);
          return {};
        }
        case 'DeleteCommand': {
          const key = input['Key'] as Item;
          const k = keyOf(key['PK'], key['SK']);
          if (input['ConditionExpression'] === 'attribute_exists(PK)' && !items.has(k)) {
            throw conditionalError();
          }
          items.delete(k);
          return {};
        }
        case 'QueryCommand': {
          const values = input['ExpressionAttributeValues'] as Item;
          const all = [...items.values()];
          if (input['IndexName'] === 'GSI3') {
            return { Items: all.filter((i) => i['GSI3PK'] === values[':pk']) };
          }
          return {
            Items: all.filter(
              (i) =>
                i['PK'] === values[':pk'] &&
                String(i['SK']).startsWith(String(values[':prefix'])) &&
                i['blockId'] === values[':blockId'],
            ),
          };
        }
        default:
          throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
      }
    }),
  };

  return { items, client: client as unknown as DynamoDBDocumentClient, send: client.send };
}

const futbol1 = {
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

// 06:00-07:30 hora de Lima (11:00-12:30 UTC) del 2026-07-12: primera franja.
const slotStart = '2026-07-12T11:00:00.000Z';
const slotEnd = '2026-07-12T12:30:00.000Z';

const reservationItem = {
  PK: 'RESERVATION#res-1',
  SK: 'METADATA',
  GSI3PK: 'RESOURCE#futbol-1',
  GSI3SK: `SLOT#${slotStart}#res-1`,
  entityType: 'Reservation',
  reservationId: 'res-1',
  resourceId: 'futbol-1',
  resourceType: 'FUTBOL',
  holderMemberId: 'member-1',
  startsAt: slotStart,
  endsAt: slotEnd,
  reservationStatus: 'CONFIRMED',
  participantCount: 1,
  guestCount: 0,
  requiresApproval: false,
  rejectionReason: null,
  cancelledAt: null,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
};

const actor = { actorId: 'admin-1', actorRole: 'admin' as const };
const now = new Date('2026-07-01T10:00:00.000Z');

function auditItems(items: Map<string, Item>): Item[] {
  return [...items.values()].filter((i) => i['entityType'] === 'AuditLog');
}

describe('createMaintenanceBlock (US-035, criterios 1/3/9/10/11/12)', () => {
  it('criterio 1/11: crea el bloqueo con affectedReservationCount=0 si no hay reservas', async () => {
    const { client, items } = buildStore([futbol1]);

    const result = await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      reason: 'Riego',
      actor,
      client,
      now,
      blockId: 'block-1',
    });

    expect(result).toEqual({
      blockId: 'block-1',
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      reason: 'Riego',
      affectedReservationCount: 0,
    });
    const stored = items.get(`RESOURCE#futbol-1|MAINT#${slotStart}#block-1`);
    expect(stored).toMatchObject({
      entityType: 'MaintenanceBlock',
      GSI3PK: 'RESOURCE#futbol-1',
      GSI3SK: `SLOT#${slotStart}#block-1`,
      createdBy: 'admin-1',
      createdAt: now.toISOString(),
    });
  });

  it('criterio 3: recurso inexistente devuelve NOT_FOUND y no escribe', async () => {
    const { client, items } = buildStore([]);

    await expect(
      createMaintenanceBlock({
        resourceId: 'nada',
        startsAt: slotStart,
        endsAt: slotEnd,
        actor,
        client,
        now,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(items.size).toBe(0);
  });

  it('defensivo: endsAt <= startsAt devuelve VALIDATION_ERROR', async () => {
    const { client } = buildStore([futbol1]);

    await expect(
      createMaintenanceBlock({
        resourceId: 'futbol-1',
        startsAt: slotEnd,
        endsAt: slotStart,
        actor,
        client,
        now,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('criterio 10/11: con una reserva activa en la ventana, la cuenta y NO la modifica', async () => {
    const { client, items } = buildStore([futbol1, reservationItem]);

    const result = await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      actor,
      client,
      now,
      blockId: 'block-1',
    });

    expect(result.affectedReservationCount).toBe(1);
    expect(result.reason).toBeNull();
    expect(items.get('RESERVATION#res-1|METADATA')).toEqual(reservationItem);
  });

  it('una reserva cancelada no cuenta como afectada', async () => {
    const { client } = buildStore([
      futbol1,
      { ...reservationItem, reservationStatus: 'CANCELLED' },
    ]);

    const result = await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      actor,
      client,
      now,
    });

    expect(result.affectedReservationCount).toBe(0);
  });

  it('criterio 9/12: audita RESOURCE_MAINTENANCE con operation CREATED y ventana', async () => {
    const { client, items } = buildStore([futbol1, reservationItem]);

    await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      reason: 'Riego',
      actor,
      client,
      now,
      blockId: 'block-1',
    });

    const audits = auditItems(items);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'RESOURCE_MAINTENANCE',
      actorId: 'admin-1',
      targetType: 'MaintenanceBlock',
      targetId: 'block-1',
      metadata: {
        operation: 'CREATED',
        resourceId: 'futbol-1',
        startsAt: slotStart,
        endsAt: slotEnd,
        affectedReservationCount: 1,
      },
    });
  });

  it('criterio 4: el bloqueo es leído por findResourceOccupancy y marca la franja MAINTENANCE (aun con reserva previa)', async () => {
    const { client } = buildStore([futbol1, reservationItem]);

    await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      actor,
      client,
      now,
      blockId: 'block-1',
    });

    const occupancy = await findResourceOccupancy(client, 'futbol-1', {
      from: slotStart,
      to: slotEnd,
    });
    expect(occupancy.maintenanceBlocks.map((b) => b.blockId)).toEqual(['block-1']);

    const availability = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client,
      now,
    });
    const slot = availability.slots.find((s) => s.startsAt === slotStart);
    expect(slot).toMatchObject({ available: false, status: 'MAINTENANCE' });
    const nextSlot = availability.slots.find((s) => s.startsAt === slotEnd);
    expect(nextSlot).toMatchObject({ available: true, status: 'AVAILABLE' });
  });
});

describe('releaseMaintenanceBlock (US-035, criterios 6/7/9)', () => {
  async function seeded() {
    const store = buildStore([futbol1]);
    await createMaintenanceBlock({
      resourceId: 'futbol-1',
      startsAt: slotStart,
      endsAt: slotEnd,
      actor,
      client: store.client,
      now,
      blockId: 'block-1',
    });
    return store;
  }

  it('criterio 6: libera el bloqueo y la franja vuelve a AVAILABLE', async () => {
    const { client, items } = await seeded();

    await releaseMaintenanceBlock({
      resourceId: 'futbol-1',
      blockId: 'block-1',
      actor,
      client,
      now,
    });

    expect(items.has(`RESOURCE#futbol-1|MAINT#${slotStart}#block-1`)).toBe(false);
    const availability = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client,
      now,
    });
    expect(availability.slots.find((s) => s.startsAt === slotStart)).toMatchObject({
      available: true,
      status: 'AVAILABLE',
    });
  });

  it('criterio 9: audita la liberación con operation RELEASED', async () => {
    const { client, items } = await seeded();

    await releaseMaintenanceBlock({
      resourceId: 'futbol-1',
      blockId: 'block-1',
      actor,
      client,
      now,
    });

    const released = auditItems(items).find(
      (a) => (a['metadata'] as { operation: string }).operation === 'RELEASED',
    );
    expect(released).toMatchObject({
      action: 'RESOURCE_MAINTENANCE',
      actorId: 'admin-1',
      targetId: 'block-1',
      metadata: { resourceId: 'futbol-1', startsAt: slotStart, endsAt: slotEnd },
    });
  });

  it('criterio 7: un blockId inexistente devuelve NOT_FOUND sin auditar', async () => {
    const { client, items } = await seeded();
    const before = auditItems(items).length;

    await expect(
      releaseMaintenanceBlock({ resourceId: 'futbol-1', blockId: 'otro', actor, client, now }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(auditItems(items)).toHaveLength(before);
  });

  it('criterio 7: liberar dos veces devuelve NOT_FOUND la segunda', async () => {
    const { client } = await seeded();
    await releaseMaintenanceBlock({
      resourceId: 'futbol-1',
      blockId: 'block-1',
      actor,
      client,
      now,
    });

    await expect(
      releaseMaintenanceBlock({ resourceId: 'futbol-1', blockId: 'block-1', actor, client, now }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('criterio 7: dos liberaciones concurrentes -> una gana, la otra NOT_FOUND, una sola auditoría de liberación', async () => {
    const { client, items } = await seeded();

    const results = await Promise.allSettled([
      releaseMaintenanceBlock({ resourceId: 'futbol-1', blockId: 'block-1', actor, client, now }),
      releaseMaintenanceBlock({ resourceId: 'futbol-1', blockId: 'block-1', actor, client, now }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'NOT_FOUND' });
    const releases = auditItems(items).filter(
      (a) => (a['metadata'] as { operation: string }).operation === 'RELEASED',
    );
    expect(releases).toHaveLength(1);
  });

  it('un blockId de otro recurso no es visible desde este recurso', async () => {
    const { client } = await seeded();

    await expect(
      releaseMaintenanceBlock({ resourceId: 'tenis-1', blockId: 'block-1', actor, client, now }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
