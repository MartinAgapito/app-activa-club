import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const {
  applyVigencyTransition,
  listActivePeriodsEndingBefore,
  listPendingTransitions,
  markTransitionProcessed,
  removePeriodFromActiveIndex,
} = await import('./repository');

function fakeClient(send: ReturnType<typeof vi.fn>): DynamoDBDocumentClient {
  return { send } as unknown as DynamoDBDocumentClient;
}

type CommandLike = { input: Record<string, unknown> };

describe('listActivePeriodsEndingBefore', () => {
  it('consulta GSI2 (nunca Scan) y pagina con LastEvaluatedKey', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [{ PK: 'MEMBER#m1', SK: 'MEMBERSHIP#a', GSI2SK: '2026-07-09' }],
        LastEvaluatedKey: { PK: 'x' },
      })
      .mockResolvedValueOnce({
        Items: [{ PK: 'MEMBER#m2', SK: 'MEMBERSHIP#b', GSI2SK: '2026-07-12T05:00:00.000Z' }],
      });

    const refs = await listActivePeriodsEndingBefore(fakeClient(send), '2026-07-19');

    expect(refs).toEqual([
      { PK: 'MEMBER#m1', SK: 'MEMBERSHIP#a', memberId: 'm1', endsAt: '2026-07-09' },
      { PK: 'MEMBER#m2', SK: 'MEMBERSHIP#b', memberId: 'm2', endsAt: '2026-07-12T05:00:00.000Z' },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    const first = (send.mock.calls[0]?.[0] as CommandLike).input;
    expect(first['IndexName']).toBe('GSI2');
    expect(first['KeyConditionExpression']).toBe('GSI2PK = :pk AND GSI2SK < :before');
    expect(first['ExpressionAttributeValues']).toEqual({
      ':pk': 'MEMBERSHIP#ACTIVE',
      ':before': '2026-07-19',
    });
    const second = (send.mock.calls[1]?.[0] as CommandLike).input;
    expect(second['ExclusiveStartKey']).toEqual({ PK: 'x' });
  });
});

describe('applyVigencyTransition', () => {
  const base = {
    memberId: 'm1',
    from: 'ACTIVE' as const,
    membershipEndsAt: '2026-07-09',
    now: '2026-07-10T05:15:00.000Z',
  };

  it('EXPIRED: Update condicional del Member + rastro + retira el período de GSI2, sin tocar memberStatus ni saldo', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await applyVigencyTransition(fakeClient(send), {
      ...base,
      to: 'EXPIRED',
      period: { PK: 'MEMBER#m1', SK: 'MEMBERSHIP#a' },
    });

    expect(outcome).toBe('APPLIED');
    const items = (send.mock.calls[0]?.[0] as CommandLike).input['TransactItems'] as Array<{
      Update?: { ConditionExpression: string; UpdateExpression: string; Key: unknown };
      Put?: { Item: Record<string, unknown>; ConditionExpression: string };
    }>;
    expect(items).toHaveLength(3);

    const memberUpdate = items[0]?.Update;
    expect(memberUpdate?.Key).toEqual({ PK: 'MEMBER#m1', SK: 'PROFILE' });
    // Escritura condicional sobre la vigencia leída (criterio 7).
    expect(memberUpdate?.ConditionExpression).toContain('membershipStatus = :from');
    expect(memberUpdate?.ConditionExpression).toContain('membershipEndsAt = :endsAt');
    // Solo toca membershipStatus y updatedAt (criterio 5).
    expect(memberUpdate?.UpdateExpression).toBe('SET membershipStatus = :to, updatedAt = :now');

    const transition = items[1]?.Put;
    expect(transition?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(transition?.Item).toMatchObject({
      PK: 'MEMBER#m1',
      SK: 'MEMBERSHIP_TRANSITION#2026-07-09#EXPIRED',
      GSI2PK: 'MEMBERSHIP#TRANSITION#PENDING',
      entityType: 'MembershipTransition',
      event: 'RENEWAL_OVERDUE',
      fromStatus: 'ACTIVE',
      toStatus: 'EXPIRED',
    });

    expect(items[2]?.Update?.UpdateExpression).toBe('REMOVE GSI2PK, GSI2SK');
  });

  it('EXPIRING_SOON: no retira el período de GSI2 y registra RENEWAL_DUE', async () => {
    const send = vi.fn().mockResolvedValue({});
    await applyVigencyTransition(fakeClient(send), {
      ...base,
      to: 'EXPIRING_SOON',
      period: { PK: 'MEMBER#m1', SK: 'MEMBERSHIP#a' },
    });
    const items = (send.mock.calls[0]?.[0] as CommandLike).input['TransactItems'] as Array<{
      Put?: { Item: Record<string, unknown> };
    }>;
    expect(items).toHaveLength(2);
    expect(items[1]?.Put?.Item).toMatchObject({ event: 'RENEWAL_DUE', toStatus: 'EXPIRING_SOON' });
  });

  it('renovación concurrente: ConditionalCheckFailed en el Member -> STALE (no lanza)', async () => {
    const error = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(error);

    await expect(
      applyVigencyTransition(fakeClient(send), { ...base, to: 'EXPIRED' }),
    ).resolves.toBe('STALE');
  });

  it('propaga cualquier otro error', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      applyVigencyTransition(fakeClient(send), { ...base, to: 'EXPIRED' }),
    ).rejects.toThrow('boom');
  });
});

describe('removePeriodFromActiveIndex', () => {
  const period = { PK: 'MEMBER#m1', SK: 'MEMBERSHIP#a', endsAt: '2026-06-01' };

  it('retira GSI2PK/GSI2SK de forma condicional', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(removePeriodFromActiveIndex(fakeClient(send), period)).resolves.toBe(true);
    const input = (send.mock.calls[0]?.[0] as CommandLike).input;
    expect(input['UpdateExpression']).toBe('REMOVE GSI2PK, GSI2SK');
    expect(input['ConditionExpression']).toContain('GSI2SK = :endsAt');
  });

  it('devuelve false si ya estaba limpio', async () => {
    const send = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('x'), { name: 'ConditionalCheckFailedException' }),
      );
    await expect(removePeriodFromActiveIndex(fakeClient(send), period)).resolves.toBe(false);
  });
});

describe('listPendingTransitions (patrón #27)', () => {
  it('consulta GSI2 por MEMBERSHIP#TRANSITION#PENDING (nunca Scan), pagina y descarta ítems mal formados', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'MEMBER#m1',
            SK: 'MEMBERSHIP_TRANSITION#2026-07-09#EXPIRED',
            event: 'RENEWAL_OVERDUE',
            membershipEndsAt: '2026-07-09',
          },
          { PK: 'MEMBER#m2', SK: 'x', event: 'OTRO', membershipEndsAt: '2026-07-09' },
        ],
        LastEvaluatedKey: { PK: 'x' },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'MEMBER#m3',
            SK: 'MEMBERSHIP_TRANSITION#2026-07-14#EXPIRING_SOON',
            event: 'RENEWAL_DUE',
            membershipEndsAt: '2026-07-14',
          },
        ],
      });

    const pending = await listPendingTransitions(fakeClient(send));

    expect(pending).toEqual([
      {
        PK: 'MEMBER#m1',
        SK: 'MEMBERSHIP_TRANSITION#2026-07-09#EXPIRED',
        memberId: 'm1',
        event: 'RENEWAL_OVERDUE',
        membershipEndsAt: '2026-07-09',
      },
      {
        PK: 'MEMBER#m3',
        SK: 'MEMBERSHIP_TRANSITION#2026-07-14#EXPIRING_SOON',
        memberId: 'm3',
        event: 'RENEWAL_DUE',
        membershipEndsAt: '2026-07-14',
      },
    ]);
    const first = (send.mock.calls[0]?.[0] as CommandLike).input;
    expect(first['IndexName']).toBe('GSI2');
    expect(first['KeyConditionExpression']).toBe('GSI2PK = :pk');
    expect(first['ExpressionAttributeValues']).toEqual({ ':pk': 'MEMBERSHIP#TRANSITION#PENDING' });
    expect((send.mock.calls[1]?.[0] as CommandLike).input['ExclusiveStartKey']).toEqual({
      PK: 'x',
    });
  });

  it('cola vacía: devuelve lista vacía', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(listPendingTransitions(fakeClient(send))).resolves.toEqual([]);
  });
});

describe('markTransitionProcessed', () => {
  const key = { PK: 'MEMBER#m1', SK: 'MEMBERSHIP_TRANSITION#2026-07-09#EXPIRED' };
  const at = '2026-07-10T13:00:00.000Z';

  it('retira GSI2PK/GSI2SK condicionado a seguir pendiente y deja constancia', async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(markTransitionProcessed(fakeClient(send), key, 'NOTIFIED', at)).resolves.toBe(
      true,
    );

    const input = (send.mock.calls[0]?.[0] as CommandLike).input;
    expect(input['Key']).toEqual(key);
    expect(input['ConditionExpression']).toBe('attribute_exists(PK) AND GSI2PK = :pending');
    expect(input['UpdateExpression']).toBe(
      'REMOVE GSI2PK, GSI2SK SET processedAt = :processedAt, processedOutcome = :outcome',
    );
    expect(input['ExpressionAttributeValues']).toEqual({
      ':pending': 'MEMBERSHIP#TRANSITION#PENDING',
      ':processedAt': at,
      ':outcome': 'NOTIFIED',
    });
  });

  it('devuelve false si otro proceso ya lo retiró', async () => {
    const error = Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
    const send = vi.fn().mockRejectedValue(error);
    await expect(markTransitionProcessed(fakeClient(send), key, 'NOTIFIED', at)).resolves.toBe(
      false,
    );
  });

  it('propaga otros errores', async () => {
    const send = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(markTransitionProcessed(fakeClient(send), key, 'NOTIFIED', at)).rejects.toThrow(
      'boom',
    );
  });
});
