import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createMaintenanceBlock, listMaintenanceBlocks, releaseMaintenanceBlock } =
  await import('./maintenance');

type Item = Record<string, unknown>;

interface CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

/**
 * DynamoDB en memoria mínimo: Get/Put/Delete por PK+SK y Query sobre la tabla
 * base (PK + `begins_with(SK)` + filtro opcional `blockId`) o GSI3. Las Query
 * devuelven los ítems ordenados por SK, como DynamoDB.
 */
function buildStore(initial: Item[] = []) {
  const items = new Map<string, Item>();
  const keyOf = (pk: unknown, sk: unknown) => `${String(pk)}|${String(sk)}`;
  for (const item of initial) items.set(keyOf(item['PK'], item['SK']), item);

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
          items.set(keyOf(item['PK'], item['SK']), item);
          return {};
        }
        case 'DeleteCommand': {
          const key = input['Key'] as Item;
          items.delete(keyOf(key['PK'], key['SK']));
          return {};
        }
        case 'QueryCommand': {
          const values = input['ExpressionAttributeValues'] as Item;
          const all = [...items.values()];
          if (input['IndexName'] === 'GSI3') {
            return { Items: all.filter((i) => i['GSI3PK'] === values[':pk']) };
          }
          return {
            Items: all
              .filter(
                (i) =>
                  i['PK'] === values[':pk'] &&
                  String(i['SK']).startsWith(String(values[':prefix'])) &&
                  (values[':blockId'] === undefined || i['blockId'] === values[':blockId']),
              )
              .sort((a, b) => String(a['SK']).localeCompare(String(b['SK']))),
          };
        }
        default:
          throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
      }
    }),
  };

  return { items, client: client as unknown as DynamoDBDocumentClient, send: client.send };
}

const piscina = {
  PK: 'RESOURCE#piscina-1',
  SK: 'METADATA',
  entityType: 'Resource',
  resourceId: 'piscina-1',
  type: 'PISCINA',
  name: 'Piscina',
  capacity: 30,
  blockMinutes: 60,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

function blockItem(blockId: string, startsAt: string, endsAt: string, resourceId = 'piscina-1') {
  return {
    PK: `RESOURCE#${resourceId}`,
    SK: `MAINT#${startsAt}#${blockId}`,
    GSI3PK: `RESOURCE#${resourceId}`,
    GSI3SK: `SLOT#${startsAt}#${blockId}`,
    entityType: 'MaintenanceBlock',
    blockId,
    resourceId,
    startsAt,
    endsAt,
    reason: `motivo ${blockId}`,
    createdBy: 'admin-1',
    createdAt: '2026-07-01T10:00:00.000Z',
  };
}

const now = new Date('2026-07-10T12:00:00.000Z');
const past = blockItem('past', '2026-07-01T10:00:00.000Z', '2026-07-01T12:00:00.000Z');
const current = blockItem('current', '2026-07-10T10:00:00.000Z', '2026-07-10T14:00:00.000Z');
const future2 = blockItem('future-2', '2026-07-25T10:00:00.000Z', '2026-07-25T12:00:00.000Z');
const future1 = blockItem('future-1', '2026-07-20T10:00:00.000Z', '2026-07-20T12:00:00.000Z');
const otherResource = blockItem(
  'other',
  '2026-07-20T10:00:00.000Z',
  '2026-07-20T12:00:00.000Z',
  'tenis-1',
);

describe('listMaintenanceBlocks (US-035, criterio 13)', () => {
  it('por defecto devuelve vigentes y futuros, sin vencidos ni de otros recursos', async () => {
    const { client } = buildStore([piscina, past, current, future1, otherResource]);

    const result = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });

    expect(result.items.map((b) => b.blockId)).toEqual(['current', 'future-1']);
  });

  it('ordena por startsAt ascendente', async () => {
    const { client } = buildStore([piscina, future2, current, future1]);

    const result = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });

    expect(result.items.map((b) => b.blockId)).toEqual(['current', 'future-1', 'future-2']);
  });

  it('filtra por solapamiento con la ventana from/to, incluyendo vencidos', async () => {
    const { client } = buildStore([piscina, past, current, future1, future2]);

    const result = await listMaintenanceBlocks({
      resourceId: 'piscina-1',
      from: '2026-06-30T00:00:00Z',
      to: '2026-07-10T12:00:00Z',
      client,
      now,
    });

    expect(result.items.map((b) => b.blockId)).toEqual(['past', 'current']);
  });

  it('un bloqueo que solo toca el borde de la ventana no se incluye (semiabierto)', async () => {
    const { client } = buildStore([piscina, future1]);

    const result = await listMaintenanceBlocks({
      resourceId: 'piscina-1',
      from: '2026-07-20T12:00:00.000Z',
      to: '2026-07-21T00:00:00.000Z',
      client,
      now,
    });

    expect(result.items).toEqual([]);
  });

  it('solo from: ventana abierta hacia adelante', async () => {
    const { client } = buildStore([piscina, past, current, future1]);

    const result = await listMaintenanceBlocks({
      resourceId: 'piscina-1',
      from: '2026-07-15T00:00:00Z',
      client,
      now,
    });

    expect(result.items.map((b) => b.blockId)).toEqual(['future-1']);
  });

  it('solo to: ventana abierta hacia atrás', async () => {
    const { client } = buildStore([piscina, past, current, future1]);

    const result = await listMaintenanceBlocks({
      resourceId: 'piscina-1',
      to: '2026-07-02T00:00:00Z',
      client,
      now,
    });

    expect(result.items.map((b) => b.blockId)).toEqual(['past']);
  });

  it('recurso sin bloqueos devuelve items vacío', async () => {
    const { client } = buildStore([piscina]);

    const result = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });

    expect(result).toEqual({ items: [] });
  });

  it('recurso inexistente devuelve NOT_FOUND', async () => {
    const { client } = buildStore([]);

    await expect(listMaintenanceBlocks({ resourceId: 'nada', client, now })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('from >= to devuelve VALIDATION_ERROR sin consultar', async () => {
    const { client, send } = buildStore([piscina]);

    await expect(
      listMaintenanceBlocks({
        resourceId: 'piscina-1',
        from: '2026-07-21T00:00:00Z',
        to: '2026-07-21T00:00:00Z',
        client,
        now,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(send).not.toHaveBeenCalled();
  });

  it('expone solo los campos del contrato (sin PK/SK/GSI/entityType)', async () => {
    const { client } = buildStore([piscina, future1]);

    const result = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });

    expect(result.items[0]).toEqual({
      blockId: 'future-1',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T10:00:00.000Z',
      endsAt: '2026-07-20T12:00:00.000Z',
      reason: 'motivo future-1',
      createdBy: 'admin-1',
      createdAt: '2026-07-01T10:00:00.000Z',
    });
  });

  it('sigue LastEvaluatedKey hasta agotar la partición', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Item: piscina })
      .mockResolvedValueOnce({ Items: [future1], LastEvaluatedKey: { PK: 'x', SK: 'y' } })
      .mockResolvedValueOnce({ Items: [future2] });
    const client = { send } as unknown as DynamoDBDocumentClient;

    const result = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });

    expect(result.items.map((b) => b.blockId)).toEqual(['future-1', 'future-2']);
  });

  it('crear y liberar: el bloqueo aparece y luego desaparece del listado', async () => {
    const { client } = buildStore([piscina]);
    const actor = { actorId: 'admin-1', actorRole: 'admin' as const };

    await createMaintenanceBlock({
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00.000Z',
      endsAt: '2026-07-20T18:00:00.000Z',
      reason: 'Limpieza',
      actor,
      client,
      now,
      blockId: 'block-1',
    });
    const before = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });
    expect(before.items.map((b) => b.blockId)).toEqual(['block-1']);

    await releaseMaintenanceBlock({
      resourceId: 'piscina-1',
      blockId: 'block-1',
      actor,
      client,
      now,
    });
    const after = await listMaintenanceBlocks({ resourceId: 'piscina-1', client, now });
    expect(after.items).toEqual([]);
  });
});
