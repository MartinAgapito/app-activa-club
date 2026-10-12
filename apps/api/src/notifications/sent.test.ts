import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { listSentNotifications, DEFAULT_SENT_PAGE_SIZE } = await import('./sent');
const { encodeCursor } = await import('../lib/cursor');

type Command = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(result: Record<string, unknown>) {
  const send = vi.fn(async (_command: unknown) => result);
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

const manual = {
  notificationId: 'N1',
  title: 'Corte de agua',
  body: 'Mañana',
  segment: 'ALL',
  targetMemberId: null,
  resourceId: null,
  event: null,
  alsoEmail: true,
  createdBy: 'admin-1',
  recipientCount: 40,
  createdAt: '2026-10-12T15:00:00.000Z',
  PK: 'NOTIFICATION#N1',
  GSI2PK: 'NOTIFICATION#SENT',
};
const automatic = {
  ...manual,
  notificationId: 'N2',
  segment: 'SINGLE',
  targetMemberId: 'm1',
  event: 'PAYMENT_SUCCEEDED',
  alsoEmail: false,
  createdBy: 'SYSTEM',
  recipientCount: 1,
};

describe('listSentNotifications', () => {
  it('consulta GSI2 NOTIFICATION#SENT, más reciente primero, sin Scan', async () => {
    const client = fakeClient({ Items: [] });
    await listSentNotifications({ client });
    const command = client.send.mock.calls[0]?.[0] as Command;
    expect(command.constructor.name).toBe('QueryCommand');
    expect(command.input).toMatchObject({
      IndexName: 'GSI2',
      ScanIndexForward: false,
      Limit: DEFAULT_SENT_PAGE_SIZE,
      ExpressionAttributeValues: { ':pk': 'NOTIFICATION#SENT' },
    });
  });

  it('distingue el origen MANUAL del SYSTEM y no filtra claves internas', async () => {
    const client = fakeClient({ Items: [manual, automatic] });
    const page = await listSentNotifications({ client });

    expect(page.items.map((i) => [i.notificationId, i.origin, i.recipientCount])).toEqual([
      ['N1', 'MANUAL', 40],
      ['N2', 'SYSTEM', 1],
    ]);
    expect(page.items[1]).toMatchObject({ event: 'PAYMENT_SUCCEEDED', createdBy: 'SYSTEM' });
    expect(page.items[0]).not.toHaveProperty('PK');
    expect(page.items[0]).not.toHaveProperty('GSI2PK');
    expect(page.nextCursor).toBeNull();
  });

  it('pagina por cursor: devuelve nextCursor y lo reenvía como ExclusiveStartKey', async () => {
    const lastKey = {
      PK: 'NOTIFICATION#N1',
      SK: 'METADATA',
      GSI2PK: 'NOTIFICATION#SENT',
      GSI2SK: 'x',
    };
    const client = fakeClient({ Items: [manual], LastEvaluatedKey: lastKey });
    const first = await listSentNotifications({ client, limit: 1 });
    expect(first.nextCursor).toBe(encodeCursor(lastKey));

    await listSentNotifications({ client, limit: 1, cursor: first.nextCursor as string });
    const second = client.send.mock.calls[1]?.[0] as Command;
    expect(second.input['ExclusiveStartKey']).toEqual(lastKey);
    expect(second.input['Limit']).toBe(1);
  });

  it('un cursor corrupto es VALIDATION_ERROR', async () => {
    await expect(
      listSentNotifications({ client: fakeClient({ Items: [] }), cursor: '%%%no' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
