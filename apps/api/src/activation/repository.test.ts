import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { completeActivationWrite, findMemberIdByDni, getMemberById, isEmailRegistered } =
  await import('./repository');
const { buildActivationUpdate } = await import('./transform');

const values = buildActivationUpdate({
  cognitoSub: 'cognito-sub-1',
  membershipEndsAt: '2027-01-01',
  outstandingBalance: 0,
  currentMembershipStatus: 'ACTIVE',
  todayLima: '2026-07-21',
  now: '2026-07-21T00:00:00Z',
});

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('findMemberIdByDni / getMemberById / isEmailRegistered', () => {
  it('devuelve el memberId cuando existe el ítem UniqueDni', async () => {
    const client = fakeClient(async () => ({ Items: [{ memberId: 'member-1' }] }));
    await expect(findMemberIdByDni(client, '45678912')).resolves.toBe('member-1');
  });

  it('devuelve undefined cuando no existe el ítem UniqueDni', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    await expect(findMemberIdByDni(client, '45678912')).resolves.toBeUndefined();
  });

  it('devuelve el Member completo por memberId', async () => {
    const member = { memberId: 'member-1', memberStatus: 'MIGRATED', cognitoSub: null };
    const client = fakeClient(async () => ({ Items: [member] }));
    await expect(getMemberById(client, 'member-1')).resolves.toEqual(member);
  });

  it('isEmailRegistered devuelve true si el correo ya está en uso', async () => {
    const client = fakeClient(async () => ({ Items: [{ memberId: 'member-2' }] }));
    await expect(isEmailRegistered(client, 'maria@example.com')).resolves.toBe(true);
  });
});

describe('completeActivationWrite', () => {
  it('escribe una única TransactWriteCommand: Put UniqueEmail + Update Member', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await completeActivationWrite(fakeClient(send), {
      memberId: 'member-1',
      emailLower: 'maria@example.com',
      values,
    });

    expect(outcome).toBe('ACTIVATED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: [
          { Put: { Item: unknown; ConditionExpression?: string } },
          { Update: { Key: unknown; ConditionExpression?: string; UpdateExpression: string } },
        ];
      };
    };
    const [putItem, updateItem] = command.input.TransactItems;
    expect(putItem.Put.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(putItem.Put.Item).toMatchObject({
      PK: 'UNIQ#EMAIL#maria@example.com',
      entityType: 'UniqueEmail',
      memberId: 'member-1',
    });
    expect(updateItem.Update.Key).toEqual({ PK: 'MEMBER#member-1', SK: 'PROFILE' });
    expect(updateItem.Update.ConditionExpression).toBe(
      'memberStatus = :migratedStatus AND cognitoSub = :nullValue',
    );
    expect(updateItem.Update.UpdateExpression).toContain('cognitoSub = :cognitoSub');
  });

  it('devuelve EMAIL_CONFLICT si la condición de unicidad del correo (índice 0) falla', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'maria@example.com',
        values,
      }),
    ).resolves.toBe('EMAIL_CONFLICT');
  });

  it('devuelve ALREADY_ACTIVATED si la condición del Member (índice 1) falla', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'maria@example.com',
        values,
      }),
    ).resolves.toBe('ALREADY_ACTIVATED');
  });

  it('propaga errores no relacionados con la condición', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'maria@example.com',
        values,
      }),
    ).rejects.toThrow('network error');
  });
});
