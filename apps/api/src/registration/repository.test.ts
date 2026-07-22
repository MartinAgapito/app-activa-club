import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { isDniRegistered, isEmailRegistered, writeNewMember } = await import('./repository');
const { buildNewMemberItems } = await import('./transform');

const items = buildNewMemberItems(
  {
    dni: '10203040',
    email: 'nuevo@example.com',
    firstName: 'Juan',
    lastName: 'Pérez',
    cognitoSub: 'cognito-sub-1',
  },
  { memberId: 'member-1', now: '2026-07-21T00:00:00Z' },
);

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('isDniRegistered / isEmailRegistered', () => {
  it('devuelve true si la consulta por PK/SK del ítem de unicidad encuentra un resultado', async () => {
    const client = fakeClient(async () => ({ Items: [{ memberId: 'member-1' }] }));
    await expect(isDniRegistered(client, '10203040')).resolves.toBe(true);
  });

  it('devuelve false si no hay ítem de unicidad para ese DNI/correo', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    await expect(isEmailRegistered(client, 'nuevo@example.com')).resolves.toBe(false);
  });
});

describe('writeNewMember', () => {
  it('escribe una única TransactWriteCommand con condición de unicidad sobre DNI/email', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await writeNewMember(fakeClient(send), items);

    expect(outcome).toBe('CREATED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: { TransactItems: { Put: { ConditionExpression?: string } }[] };
    };
    expect(command.input.TransactItems).toHaveLength(3);
    expect(command.input.TransactItems[0]?.Put.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
    expect(command.input.TransactItems[1]?.Put.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
    expect(command.input.TransactItems[2]?.Put.ConditionExpression).toBeUndefined();
  });

  it('devuelve DNI_CONFLICT si la condición de unicidad del DNI (índice 0) falla', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(writeNewMember(fakeClient(send), items)).resolves.toBe('DNI_CONFLICT');
  });

  it('devuelve EMAIL_CONFLICT si la condición de unicidad del correo (índice 1) falla', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(writeNewMember(fakeClient(send), items)).resolves.toBe('EMAIL_CONFLICT');
  });

  it('propaga errores no relacionados con la condición de unicidad', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(writeNewMember(fakeClient(send), items)).rejects.toThrow('network error');
  });
});
