import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { readNotification } = await import('./read');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: { PK: string; SK: string };
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

const NOW = new Date('2026-07-21T12:00:00.000Z');
const stored = {
  PK: 'MEMBER#member-1',
  SK: 'NOTIF#2026-07-01T10:00:00.000Z#n-1',
  notificationId: 'n-1',
  memberId: 'member-1',
  title: 'Pago confirmado',
  body: 'Tu pago fue confirmado.',
  event: 'PAYMENT_SUCCEEDED',
  readStatus: 'UNREAD',
  createdAt: '2026-07-01T10:00:00.000Z',
  readAt: null,
};

function fakeClient(handlers: {
  inbox?: Record<string, unknown> | null;
  update?: () => unknown;
  get?: Record<string, unknown> | null;
}) {
  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const name = cmd.constructor.name;
    if (name === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
      return { Items: [{ memberId: 'member-1', cognitoSub: 'sub-1' }] };
    }
    if (name === 'QueryCommand') {
      return { Items: handlers.inbox ? [handlers.inbox] : [] };
    }
    if (name === 'UpdateCommand') {
      if (!handlers.update) throw new Error('UpdateItem inesperado');
      return handlers.update();
    }
    if (name === 'GetCommand') {
      return { Item: handlers.get ?? undefined };
    }
    throw new Error(`Comando inesperado: ${name}`);
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> };
}

describe('readNotification (US-041, criterios 3/4/5)', () => {
  it('marca READ con readAt del reloj y la devuelve', async () => {
    const client = fakeClient({
      inbox: stored,
      update: () => ({
        Attributes: { ...stored, readStatus: 'READ', readAt: NOW.toISOString() },
      }),
    });

    const result = await readNotification({
      cognitoSub: 'sub-1',
      notificationId: 'n-1',
      now: () => NOW,
      client,
    });

    expect(result).toMatchObject({
      notificationId: 'n-1',
      readStatus: 'READ',
      readAt: '2026-07-21T12:00:00.000Z',
    });
    const update = client.send.mock.calls
      .map((call) => call[0] as CommandLike)
      .find((cmd) => cmd.constructor.name === 'UpdateCommand');
    expect(update?.input.Key).toEqual({ PK: 'MEMBER#member-1', SK: stored.SK });
    expect(update?.input.ExpressionAttributeValues?.[':readAt']).toBe('2026-07-21T12:00:00.000Z');
  });

  it('idempotente: ya leída responde éxito conservando el readAt original', async () => {
    const already = { ...stored, readStatus: 'READ', readAt: '2026-07-10T09:00:00.000Z' };
    const client = fakeClient({
      inbox: already,
      update: () => {
        throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
      },
      get: already,
    });

    const result = await readNotification({
      cognitoSub: 'sub-1',
      notificationId: 'n-1',
      now: () => NOW,
      client,
    });

    expect(result).toMatchObject({ readStatus: 'READ', readAt: '2026-07-10T09:00:00.000Z' });
  });

  it('404 NOT_FOUND si la notificación no está en la bandeja del socio (ajena o inexistente)', async () => {
    const client = fakeClient({ inbox: null });

    await expect(
      readNotification({ cognitoSub: 'sub-1', notificationId: 'n-ajena', client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const wrote = client.send.mock.calls.some(
      (call) => (call[0] as CommandLike).constructor.name === 'UpdateCommand',
    );
    expect(wrote).toBe(false);
  });

  it('404 NOT_FOUND si el cognitoSub no resuelve a un socio', async () => {
    const client = {
      send: vi.fn(async () => ({ Items: [] })),
    } as unknown as DynamoDBDocumentClient;

    await expect(
      readNotification({ cognitoSub: 'sub-x', notificationId: 'n-1', client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('404 NOT_FOUND si el ítem desapareció entre la búsqueda y la escritura', async () => {
    const client = fakeClient({
      inbox: stored,
      update: () => {
        throw Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
      },
      get: null,
    });

    await expect(
      readNotification({ cognitoSub: 'sub-1', notificationId: 'n-1', client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
