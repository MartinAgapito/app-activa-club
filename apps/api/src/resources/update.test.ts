import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { updateResource } = await import('./update');
const { getResourceAvailability } = await import('../reservations/availability');
const { createReservation } = await import('../reservations/create');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, string>;
    Item?: Record<string, unknown>;
    UpdateExpression?: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ReturnValues?: string;
  };
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

const activeMember = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-1',
  rejectionReason: null,
  membershipType: 'MONTHLY',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00.000Z',
  membershipEndsAt: '2026-12-31T00:00:00.000Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Cliente en memoria con un único recurso mutable: aplica el `UpdateItem` del
 * repositorio (nombres/valores de expresión) y sirve el recurso ya modificado a
 * las lecturas posteriores (disponibilidad y creación de reservas). Permite
 * probar de punta a punta el efecto del PATCH (criterios 4-6).
 */
function buildStatefulClient(initial: Record<string, unknown> | null = futbol1) {
  const resource: Record<string, unknown> | null = initial ? { ...initial } : null;
  const audits: Record<string, unknown>[] = [];
  const updates: CommandLike[] = [];

  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const ctor = cmd.constructor.name;
    const input = cmd.input;

    if (ctor === 'GetCommand') {
      const pk = input.Key?.['PK'] ?? '';
      if (pk.startsWith('RESOURCE#')) return resource ? { Item: resource } : {};
      if (pk.startsWith('GUEST#')) return {};
      throw new Error(`GetCommand inesperado: ${pk}`);
    }
    if (ctor === 'UpdateCommand') {
      updates.push(cmd);
      if (!resource) {
        throw Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' });
      }
      for (const [placeholder, attribute] of Object.entries(input.ExpressionAttributeNames ?? {})) {
        resource[attribute] = input.ExpressionAttributeValues?.[`:${placeholder.slice(1)}`];
      }
      return { Attributes: { ...resource } };
    }
    if (ctor === 'PutCommand') {
      if (input.Item?.['entityType'] === 'AuditLog') audits.push(input.Item);
      return {};
    }
    if (ctor === 'QueryCommand' && input.IndexName === 'GSI1') {
      const pk = String(input.ExpressionAttributeValues?.[':pk'] ?? '');
      if (pk.startsWith('COGNITO#')) return { Items: [activeMember] };
      return { Items: [] };
    }
    if (ctor === 'QueryCommand') {
      return { Items: [] };
    }
    if (ctor === 'TransactWriteCommand') return {};
    throw new Error(`Comando inesperado: ${ctor}`);
  });

  return {
    client: { send } as unknown as DynamoDBDocumentClient,
    send,
    audits,
    updates,
    current: () => resource,
  };
}

const admin = { actorId: 'admin-sub', actorRole: 'admin' as const };
const now = new Date('2026-07-10T12:00:00.000Z');

describe('updateResource (US-036, criterios 1-3, 6, 7, 11)', () => {
  it('criterio 1: actualiza cada campo individualmente y devuelve el recurso sin claves internas', async () => {
    for (const changes of [
      { capacity: 8 },
      { opensAt: '07:00' },
      { closesAt: '21:00' },
      { resourceStatus: 'MAINTENANCE' as const },
    ]) {
      const { client } = buildStatefulClient();
      const result = await updateResource({
        resourceId: 'futbol-1',
        changes,
        actor: admin,
        client,
        now,
      });

      expect(result).toMatchObject(changes);
      expect(result).not.toHaveProperty('PK');
      expect(result).not.toHaveProperty('entityType');
      expect(result.blockMinutes).toBe(90);
      expect(result.name).toBe('Cancha de fútbol 1');
    }
  });

  it('criterio 1: actualiza varios campos en un solo UpdateItem condicionado a attribute_exists(PK)', async () => {
    const { client, updates } = buildStatefulClient();

    const result = await updateResource({
      resourceId: 'futbol-1',
      changes: { capacity: 10, opensAt: '08:00', closesAt: '20:00', resourceStatus: 'MAINTENANCE' },
      actor: admin,
      client,
      now,
    });

    expect(result).toMatchObject({
      capacity: 10,
      opensAt: '08:00',
      closesAt: '20:00',
      resourceStatus: 'MAINTENANCE',
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]?.input.ConditionExpression).toBe('attribute_exists(PK)');
    expect(updates[0]?.input.Key).toEqual({ PK: 'RESOURCE#futbol-1', SK: 'METADATA' });
  });

  it('criterio 7: el UpdateItem nunca escribe blockMinutes, type, name ni requiresApproval', async () => {
    const { client, updates } = buildStatefulClient();

    await updateResource({
      resourceId: 'futbol-1',
      // Aunque el llamante colara otros campos, la lista cerrada los descarta.
      changes: { capacity: 10, blockMinutes: 30, name: 'Otro' } as never,
      actor: admin,
      client,
      now,
    });

    const names = Object.values(updates[0]?.input.ExpressionAttributeNames ?? {});
    expect(names).toEqual(['capacity']);
  });

  it('criterio 2: closesAt <= opensAt resultante tras mezclar con el actual devuelve VALIDATION_ERROR', async () => {
    const solo = buildStatefulClient();
    // closesAt vigente 22:00; solo se manda opensAt posterior.
    await expect(
      updateResource({
        resourceId: 'futbol-1',
        changes: { opensAt: '22:30' },
        actor: admin,
        client: solo.client,
        now,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    const iguales = buildStatefulClient();
    await expect(
      updateResource({
        resourceId: 'futbol-1',
        changes: { closesAt: '06:00' },
        actor: admin,
        client: iguales.client,
        now,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    const invertidos = buildStatefulClient();
    await expect(
      updateResource({
        resourceId: 'futbol-1',
        changes: { opensAt: '20:00', closesAt: '10:00' },
        actor: admin,
        client: invertidos.client,
        now,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));

    expect(solo.updates).toHaveLength(0);
    expect(solo.audits).toHaveLength(0);
  });

  it('criterio 3: recurso inexistente devuelve NOT_FOUND sin escribir', async () => {
    const { client, updates, audits } = buildStatefulClient(null);

    await expect(
      updateResource({ resourceId: 'nada', changes: { capacity: 3 }, actor: admin, client, now }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('criterio 11: audita RESOURCE_UPDATED con actor, recurso objetivo y campos modificados', async () => {
    const { client, audits } = buildStatefulClient();

    await updateResource({
      resourceId: 'futbol-1',
      changes: { capacity: 8, resourceStatus: 'MAINTENANCE' },
      actor: admin,
      client,
      now,
    });

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'RESOURCE_UPDATED',
      actorId: 'admin-sub',
      actorRole: 'admin',
      targetType: 'Resource',
      targetId: 'futbol-1',
      timestamp: now.toISOString(),
      metadata: {
        fields: ['capacity', 'resourceStatus'],
        changes: {
          capacity: { from: 14, to: 8 },
          resourceStatus: { from: 'AVAILABLE', to: 'MAINTENANCE' },
        },
      },
    });
  });

  it('un PATCH que no cambia ningún valor responde sin escribir ni auditar', async () => {
    const { client, updates, audits } = buildStatefulClient();

    const result = await updateResource({
      resourceId: 'futbol-1',
      changes: { capacity: 14 },
      actor: admin,
      client,
      now,
    });

    expect(result.capacity).toBe(14);
    expect(updates).toHaveLength(0);
    expect(audits).toHaveLength(0);
  });

  it('NOT_FOUND si el recurso desaparece entre la lectura y la escritura (condición fallida)', async () => {
    const send = vi.fn(async (command: unknown) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'GetCommand') return { Item: futbol1 };
      throw Object.assign(new Error('condition'), { name: 'ConditionalCheckFailedException' });
    });

    await expect(
      updateResource({
        resourceId: 'futbol-1',
        changes: { capacity: 3 },
        actor: admin,
        client: { send } as unknown as DynamoDBDocumentClient,
        now,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('efecto del PATCH en disponibilidad y reservas (US-036, criterios 4-6)', () => {
  const beforeSlots = new Date('2026-07-10T00:00:00.000Z');

  it('criterio 4: la disponibilidad genera franjas con el horario nuevo', async () => {
    const { client } = buildStatefulClient();

    const antes = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client,
      now: beforeSlots,
    });
    await updateResource({
      resourceId: 'futbol-1',
      changes: { opensAt: '08:00', closesAt: '12:00' },
      actor: admin,
      client,
      now,
    });
    const despues = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client,
      now: beforeSlots,
    });

    expect(antes.slots[0]?.startsAt).toBe('2026-07-12T11:00:00.000Z'); // 06:00 Lima
    expect(despues.slots[0]?.startsAt).toBe('2026-07-12T13:00:00.000Z'); // 08:00 Lima
    // 08:00-12:00 con bloques de 90 min: 08:00, 09:30 (11:00 no cabe completa).
    expect(despues.slots).toHaveLength(2);
  });

  it('criterio 5: una reserva nueva que supera el aforo reducido se rechaza con CAPACITY_EXCEEDED', async () => {
    const { client } = buildStatefulClient();
    await updateResource({
      resourceId: 'futbol-1',
      changes: { capacity: 1 },
      actor: admin,
      client,
      now,
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: {
          resourceId: 'futbol-1',
          startsAt: '2026-07-12T11:00:00.000Z',
          participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
        },
        client,
        now: beforeSlots,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }));
  });

  it('criterio 6: MAINTENANCE bloquea la disponibilidad y la creación; AVAILABLE la rehabilita', async () => {
    const { client } = buildStatefulClient();
    const request = {
      resourceId: 'futbol-1',
      startsAt: '2026-07-12T11:00:00.000Z',
      participants: [],
    };

    await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'MAINTENANCE' },
      actor: admin,
      client,
      now,
    });

    const enMantenimiento = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client,
      now: beforeSlots,
    });
    expect(enMantenimiento.resourceStatus).toBe('MAINTENANCE');
    expect(enMantenimiento.slots.every((slot) => !slot.available)).toBe(true);
    expect(enMantenimiento.slots.every((slot) => slot.status === 'MAINTENANCE')).toBe(true);
    await expect(
      createReservation({ cognitoSub: 'sub-1', request, client, now: beforeSlots }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'RESOURCE_IN_MAINTENANCE' }));

    await updateResource({
      resourceId: 'futbol-1',
      changes: { resourceStatus: 'AVAILABLE' },
      actor: admin,
      client,
      now,
    });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request,
      client,
      now: beforeSlots,
    });
    expect(result.reservationStatus).toBe('CONFIRMED');
  });
});
