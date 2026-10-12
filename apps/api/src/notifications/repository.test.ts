import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { decodeCursor, encodeCursor } = await import('../lib/cursor');
const { findInboxItem, listInbox, markInboxItemRead } = await import('./repository');

interface CommandLike {
  constructor: { name: string };
  input: Record<string, unknown>;
}

function fakeClient(responses: unknown[] | ((command: CommandLike) => unknown)) {
  const queue = Array.isArray(responses) ? [...responses] : null;
  const send = vi.fn(async (command: unknown) => {
    const response = queue
      ? queue.shift()
      : (responses as (c: CommandLike) => unknown)(command as CommandLike);
    if (response instanceof Error) throw response;
    return response;
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> };
}

function item(n: number, readStatus: 'UNREAD' | 'READ' = 'UNREAD') {
  const createdAt = `2026-07-${String(n).padStart(2, '0')}T10:00:00.000Z`;
  return {
    PK: 'MEMBER#m-1',
    SK: `NOTIF#${createdAt}#n-${n}`,
    entityType: 'MemberNotification',
    notificationId: `n-${n}`,
    memberId: 'm-1',
    title: `Título ${n}`,
    body: `Cuerpo ${n}`,
    event: 'PAYMENT_SUCCEEDED',
    readStatus,
    createdAt,
    readAt: readStatus === 'READ' ? '2026-07-20T10:00:00.000Z' : null,
  };
}

describe('listInbox', () => {
  it('consulta la partición del socio, más reciente primero, sin memberId en la salida', async () => {
    const client = fakeClient([{ Items: [item(2), item(1)] }]);

    const result = await listInbox(client, 'm-1');

    const input = client.send.mock.calls[0]?.[0].input;
    expect(input).toMatchObject({
      TableName: 'activa-club-test',
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': 'MEMBER#m-1', ':prefix': 'NOTIF#' },
      ScanIndexForward: false,
      Limit: 20,
    });
    expect(input.IndexName).toBeUndefined();
    expect(input.FilterExpression).toBeUndefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      notificationId: 'n-2',
      title: 'Título 2',
      body: 'Cuerpo 2',
      event: 'PAYMENT_SUCCEEDED',
      readStatus: 'UNREAD',
      createdAt: '2026-07-02T10:00:00.000Z',
      readAt: null,
    });
    expect(result.items[0]).not.toHaveProperty('memberId');
    expect(result.nextCursor).toBeNull();
  });

  it('bandeja vacía devuelve items [] y nextCursor null', async () => {
    const client = fakeClient([{ Items: [] }]);

    expect(await listInbox(client, 'm-1')).toEqual({ items: [], nextCursor: null });
  });

  it('normaliza event y readAt ausentes a null', async () => {
    const raw = { ...item(1) } as Record<string, unknown>;
    delete raw['event'];
    delete raw['readAt'];
    const client = fakeClient([{ Items: [raw] }]);

    const result = await listInbox(client, 'm-1');

    expect(result.items[0]).toMatchObject({ event: null, readAt: null });
  });

  it('pagina: devuelve nextCursor opaco y lo usa como ExclusiveStartKey', async () => {
    const lastKey = { PK: 'MEMBER#m-1', SK: 'NOTIF#x' };
    const first = fakeClient([{ Items: [item(3)], LastEvaluatedKey: lastKey }]);

    const page = await listInbox(first, 'm-1', { limit: 1 });
    expect(page.nextCursor).toBe(encodeCursor(lastKey));
    expect(first.send.mock.calls[0]?.[0].input.Limit).toBe(1);

    const second = fakeClient([{ Items: [item(2)] }]);
    await listInbox(second, 'm-1', { cursor: page.nextCursor as string });
    expect(second.send.mock.calls[0]?.[0].input.ExclusiveStartKey).toEqual(lastKey);
  });

  it('cursor corrupto produce VALIDATION_ERROR', async () => {
    const client = fakeClient([{ Items: [] }]);

    await expect(listInbox(client, 'm-1', { cursor: '%%%' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('unreadOnly aplica FilterExpression readStatus = UNREAD', async () => {
    const client = fakeClient([{ Items: [item(2)] }]);

    await listInbox(client, 'm-1', { unreadOnly: true });

    const input = client.send.mock.calls[0]?.[0].input;
    expect(input.FilterExpression).toBe('readStatus = :unread');
    expect(input.ExpressionAttributeValues[':unread']).toBe('UNREAD');
  });

  it('unreadOnly encadena Query hasta completar la página', async () => {
    const k1 = { PK: 'MEMBER#m-1', SK: 'NOTIF#k1' };
    const k2 = { PK: 'MEMBER#m-1', SK: 'NOTIF#k2' };
    const client = fakeClient([
      { Items: [], LastEvaluatedKey: k1 },
      { Items: [item(5)], LastEvaluatedKey: k2 },
      { Items: [item(4)] },
    ]);

    const result = await listInbox(client, 'm-1', { unreadOnly: true, limit: 2 });

    expect(client.send).toHaveBeenCalledTimes(3);
    expect(client.send.mock.calls[1]?.[0].input.ExclusiveStartKey).toEqual(k1);
    expect(result.items.map((i) => i.notificationId)).toEqual(['n-5', 'n-4']);
    expect(result.nextCursor).toBeNull();
  });

  it('unreadOnly recorta al límite y reconstruye el cursor desde el último ítem conservado', async () => {
    const k1 = { PK: 'MEMBER#m-1', SK: 'NOTIF#k1' };
    const a = item(9);
    const b = item(8);
    const c = item(7);
    const client = fakeClient([
      { Items: [a, b], LastEvaluatedKey: k1 },
      { Items: [c], LastEvaluatedKey: { PK: 'MEMBER#m-1', SK: 'NOTIF#k2' } },
    ]);

    const result = await listInbox(client, 'm-1', { unreadOnly: true, limit: 3 });
    expect(result.items).toHaveLength(3);

    const small = fakeClient([
      { Items: [a, b], LastEvaluatedKey: k1 },
      { Items: [c, item(6)], LastEvaluatedKey: { PK: 'x', SK: 'y' } },
    ]);
    const trimmed = await listInbox(small, 'm-1', { unreadOnly: true, limit: 3 });
    expect(trimmed.items.map((i) => i.notificationId)).toEqual(['n-9', 'n-8', 'n-7']);
    expect(decodeCursor(trimmed.nextCursor as string)).toEqual({ PK: c.PK, SK: c.SK });
  });

  it('unreadOnly se detiene en el tope de consultas y devuelve el cursor pendiente', async () => {
    const key = { PK: 'MEMBER#m-1', SK: 'NOTIF#k' };
    const client = fakeClient(() => ({ Items: [], LastEvaluatedKey: key }));

    const result = await listInbox(client, 'm-1', { unreadOnly: true, limit: 5 });

    expect(client.send).toHaveBeenCalledTimes(5);
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBe(encodeCursor(key));
  });

  it('sin unreadOnly no encadena consultas aunque la página venga corta', async () => {
    const key = { PK: 'MEMBER#m-1', SK: 'NOTIF#k' };
    const client = fakeClient([{ Items: [item(1)], LastEvaluatedKey: key }]);

    await listInbox(client, 'm-1', { limit: 5 });

    expect(client.send).toHaveBeenCalledTimes(1);
  });
});

describe('findInboxItem', () => {
  it('busca por notificationId dentro de la partición del socio', async () => {
    const client = fakeClient([{ Items: [item(3)] }]);

    const found = await findInboxItem(client, 'm-1', 'n-3');

    expect(found?.['notificationId']).toBe('n-3');
    expect(client.send.mock.calls[0]?.[0].input).toMatchObject({
      FilterExpression: 'notificationId = :id',
      ExpressionAttributeValues: { ':pk': 'MEMBER#m-1', ':prefix': 'NOTIF#', ':id': 'n-3' },
    });
  });

  it('recorre páginas hasta encontrarla', async () => {
    const client = fakeClient([
      { Items: [], LastEvaluatedKey: { PK: 'MEMBER#m-1', SK: 'NOTIF#a' } },
      { Items: [item(1)] },
    ]);

    const found = await findInboxItem(client, 'm-1', 'n-1');

    expect(found?.['notificationId']).toBe('n-1');
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('null cuando se agotó la partición', async () => {
    const client = fakeClient([{ Items: [] }]);

    expect(await findInboxItem(client, 'm-1', 'n-x')).toBeNull();
  });

  it('null al alcanzar el tope de páginas', async () => {
    const client = fakeClient(() => ({
      Items: [],
      LastEvaluatedKey: { PK: 'MEMBER#m-1', SK: 'NOTIF#a' },
    }));

    expect(await findInboxItem(client, 'm-1', 'n-x')).toBeNull();
    expect(client.send).toHaveBeenCalledTimes(10);
  });
});

describe('markInboxItemRead', () => {
  const readAt = '2026-07-21T12:00:00.000Z';

  it('escribe READ + readAt con condición UNREAD y devuelve el ítem actualizado', async () => {
    const updated = { ...item(1, 'READ'), readAt };
    const client = fakeClient([{ Attributes: updated }]);

    const result = await markInboxItemRead(client, 'm-1', item(1).createdAt, 'n-1', readAt);

    const input = client.send.mock.calls[0]?.[0].input;
    expect(input).toMatchObject({
      Key: { PK: 'MEMBER#m-1', SK: `NOTIF#${item(1).createdAt}#n-1` },
      UpdateExpression: 'SET readStatus = :read, readAt = :readAt',
      ConditionExpression: 'attribute_exists(PK) AND readStatus = :unread',
      ExpressionAttributeValues: { ':read': 'READ', ':readAt': readAt, ':unread': 'UNREAD' },
    });
    expect(result).toMatchObject({ notificationId: 'n-1', readStatus: 'READ', readAt });
  });

  it('idempotente: si ya estaba leída devuelve el estado actual sin cambiar readAt', async () => {
    const conditional = Object.assign(new Error('cond'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = fakeClient([conditional, { Item: item(1, 'READ') }]);

    const result = await markInboxItemRead(client, 'm-1', item(1).createdAt, 'n-1', readAt);

    expect(result).toMatchObject({ readStatus: 'READ', readAt: '2026-07-20T10:00:00.000Z' });
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('null si el ítem desapareció entre la búsqueda y la escritura', async () => {
    const conditional = Object.assign(new Error('cond'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = fakeClient([conditional, {}]);

    expect(await markInboxItemRead(client, 'm-1', item(1).createdAt, 'n-1', readAt)).toBeNull();
  });

  it('propaga errores distintos del condicional', async () => {
    const client = fakeClient([new Error('boom')]);

    await expect(
      markInboxItemRead(client, 'm-1', item(1).createdAt, 'n-1', readAt),
    ).rejects.toThrow('boom');
  });
});
