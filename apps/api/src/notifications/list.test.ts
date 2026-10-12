import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { listNotifications } = await import('./list');

interface CommandLike {
  input: {
    IndexName?: string;
    FilterExpression?: string;
    Limit?: number;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

function fakeClient(send: (command: CommandLike) => unknown) {
  return {
    send: vi.fn(async (command: unknown) => send(command as CommandLike)),
  } as unknown as DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> };
}

const memberRow = { memberId: 'member-1', cognitoSub: 'sub-1' };

describe('listNotifications (US-041, criterios 1/2/5)', () => {
  it('resuelve al socio por cognitoSub (GSI1) y consulta su partición MEMBER#<id>', async () => {
    const client = fakeClient((cmd) => {
      if (cmd.input.IndexName === 'GSI1') {
        expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('COGNITO#sub-1');
        return { Items: [memberRow] };
      }
      expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('MEMBER#member-1');
      return {
        Items: [
          {
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
          },
        ],
      };
    });

    const result = await listNotifications({ cognitoSub: 'sub-1', client });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ notificationId: 'n-1', event: 'PAYMENT_SUCCEEDED' });
    expect(result.nextCursor).toBeNull();
  });

  it('reenvía unreadOnly y limit al repositorio', async () => {
    const client = fakeClient((cmd) =>
      cmd.input.IndexName === 'GSI1' ? { Items: [memberRow] } : { Items: [] },
    );

    await listNotifications({ cognitoSub: 'sub-1', unreadOnly: true, limit: 7, client });

    const inbox = client.send.mock.calls[1]?.[0].input as CommandLike['input'];
    expect(inbox.FilterExpression).toBe('readStatus = :unread');
    expect(inbox.Limit).toBe(7);
  });

  it('NOT_FOUND si el cognitoSub no resuelve a ningún socio (defensivo)', async () => {
    const client = fakeClient(() => ({ Items: [] }));

    await expect(listNotifications({ cognitoSub: 'sub-x', client })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(client.send).toHaveBeenCalledTimes(1);
  });
});
