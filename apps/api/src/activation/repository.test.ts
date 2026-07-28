import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { completeActivationWrite, findMemberIdByDni, findUniqueEmailOwner, getMemberById } =
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

describe('findMemberIdByDni / getMemberById / findUniqueEmailOwner', () => {
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

  it('findUniqueEmailOwner devuelve el memberId dueño si el correo ya está en uso', async () => {
    const client = fakeClient(async () => ({ Items: [{ memberId: 'member-2' }] }));
    await expect(findUniqueEmailOwner(client, 'maria@example.com')).resolves.toBe('member-2');
  });

  it('findUniqueEmailOwner devuelve undefined si el correo no está registrado', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    await expect(findUniqueEmailOwner(client, 'nuevo@example.com')).resolves.toBeUndefined();
  });
});

describe('completeActivationWrite', () => {
  it('con correo distinto al migrado: Delete UniqueEmail viejo + Put UniqueEmail nuevo + Update Member (con email)', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await completeActivationWrite(fakeClient(send), {
      memberId: 'member-1',
      emailLower: 'nuevo@example.com',
      previousEmailLower: 'antigua@example.com',
      values,
    });

    expect(outcome).toBe('ACTIVATED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: [
          { Delete: { Key: unknown } },
          { Put: { Item: unknown; ConditionExpression?: string } },
          { Update: { Key: unknown; ConditionExpression?: string; UpdateExpression: string } },
        ];
      };
    };
    const [deleteItem, putItem, updateItem] = command.input.TransactItems;
    expect(deleteItem.Delete.Key).toEqual({
      PK: 'UNIQ#EMAIL#antigua@example.com',
      SK: 'UNIQ#EMAIL#antigua@example.com',
    });
    expect(putItem.Put.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(putItem.Put.Item).toMatchObject({
      PK: 'UNIQ#EMAIL#nuevo@example.com',
      entityType: 'UniqueEmail',
      memberId: 'member-1',
    });
    expect(updateItem.Update.Key).toEqual({ PK: 'MEMBER#member-1', SK: 'PROFILE' });
    expect(updateItem.Update.ConditionExpression).toBe(
      'memberStatus = :migratedStatus AND cognitoSub = :nullValue',
    );
    expect(updateItem.Update.UpdateExpression).toContain('cognitoSub = :cognitoSub');
    expect(updateItem.Update.UpdateExpression).toContain('email = :email');
  });

  it('con el correo migrado propio (sin cambios): solo Update Member, sin tocar UniqueEmail', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await completeActivationWrite(fakeClient(send), {
      memberId: 'member-1',
      emailLower: 'maria@example.com',
      previousEmailLower: 'maria@example.com',
      values,
    });

    expect(outcome).toBe('ACTIVATED');
    const command = send.mock.calls[0]?.[0] as {
      input: { TransactItems: unknown[] };
    };
    expect(command.input.TransactItems).toHaveLength(1);
    const [updateItem] = command.input.TransactItems as [{ Update: { UpdateExpression: string } }];
    expect(updateItem.Update.UpdateExpression).not.toContain('email = :email');
  });

  it('devuelve EMAIL_CONFLICT si la condición de unicidad del correo nuevo falla', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'nuevo@example.com',
        previousEmailLower: 'antigua@example.com',
        values,
      }),
    ).resolves.toBe('EMAIL_CONFLICT');
  });

  it('devuelve ALREADY_ACTIVATED si la condición del Member falla (correo cambiado)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'nuevo@example.com',
        previousEmailLower: 'antigua@example.com',
        values,
      }),
    ).resolves.toBe('ALREADY_ACTIVATED');
  });

  it('devuelve ALREADY_ACTIVATED si la condición del Member falla (correo migrado sin cambios)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      completeActivationWrite(fakeClient(send), {
        memberId: 'member-1',
        emailLower: 'maria@example.com',
        previousEmailLower: 'maria@example.com',
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
        previousEmailLower: 'antigua@example.com',
        values,
      }),
    ).rejects.toThrow('network error');
  });
});
