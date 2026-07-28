import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CompleteActivationRequest } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { completeActivation } = await import('./complete');

const validRequest: CompleteActivationRequest = {
  dni: '45678912',
  email: 'Maria@Example.com',
  password: 'Sup3rSecreta!',
};

const migratedMember = {
  memberId: 'member-1',
  firstName: 'María',
  email: 'antigua@example.com',
  memberStatus: 'MIGRATED',
  cognitoSub: null,
  membershipEndsAt: '2027-01-01',
  membershipStatus: 'ACTIVE',
  outstandingBalance: 0,
};

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

function pkOf(command: unknown): string | undefined {
  return (command as { input: { ExpressionAttributeValues?: Record<string, string> } }).input
    .ExpressionAttributeValues?.[':pk'];
}

function ctorName(command: unknown): string {
  return (command as { constructor: { name: string } }).constructor.name;
}

function defaultRouting(member: Record<string, unknown> | null) {
  return async (command: unknown) => {
    if (ctorName(command) === 'TransactWriteCommand') return {};
    const pk = pkOf(command);
    if (pk === 'UNIQ#DNI#45678912') return { Items: member ? [{ memberId: 'member-1' }] : [] };
    if (pk === 'MEMBER#member-1') return { Items: member ? [member] : [] };
    if (pk?.startsWith('UNIQ#EMAIL#')) return { Items: [] };
    return { Items: [] };
  };
}

describe('completeActivation', () => {
  it('activa la cuenta, transiciona a ACTIVE y devuelve membershipStatus vigente (criterio 4)', async () => {
    const client = fakeClient(defaultRouting(migratedMember));
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    const result = await completeActivation({
      request: validRequest,
      client,
      createCognitoUser,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result).toEqual({
      memberId: 'member-1',
      memberStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
    });
    expect(createCognitoUser).toHaveBeenCalledWith({
      email: 'maria@example.com',
      password: 'Sup3rSecreta!',
    });
  });

  it('conserva membershipStatus DEBT si el socio migrado tiene saldo pendiente (caso alternativo)', async () => {
    const client = fakeClient(defaultRouting({ ...migratedMember, outstandingBalance: 5000 }));
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    const result = await completeActivation({
      request: validRequest,
      client,
      createCognitoUser,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result.memberStatus).toBe('ACTIVE');
    expect(result.membershipStatus).toBe('DEBT');
  });

  it('conserva membershipStatus EXPIRED si la membresía migrada ya venció (caso alternativo)', async () => {
    const client = fakeClient(
      defaultRouting({ ...migratedMember, membershipEndsAt: '2026-01-01' }),
    );
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    const result = await completeActivation({
      request: validRequest,
      client,
      createCognitoUser,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result.memberStatus).toBe('ACTIVE');
    expect(result.membershipStatus).toBe('EXPIRED');
  });

  it('devuelve DNI_NOT_FOUND (404) sin crear usuario Cognito si el DNI no existe', async () => {
    const client = fakeClient(defaultRouting(null));
    const createCognitoUser = vi.fn();

    await expect(
      completeActivation({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'DNI_NOT_FOUND' });
    expect(createCognitoUser).not.toHaveBeenCalled();
  });

  it('devuelve ALREADY_ACTIVATED (409) sin crear usuario Cognito si ya tiene cognitoSub (criterio 5)', async () => {
    const client = fakeClient(defaultRouting({ ...migratedMember, cognitoSub: 'cognito-sub-0' }));
    const createCognitoUser = vi.fn();

    await expect(
      completeActivation({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'ALREADY_ACTIVATED' });
    expect(createCognitoUser).not.toHaveBeenCalled();
  });

  it('devuelve EMAIL_ALREADY_USED (409) sin crear usuario Cognito si el correo ya está en uso (criterio 5)', async () => {
    const client = fakeClient(async (command) => {
      const pk = pkOf(command);
      if (pk === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      if (pk === 'MEMBER#member-1') return { Items: [migratedMember] };
      if (pk?.startsWith('UNIQ#EMAIL#')) return { Items: [{ memberId: 'otro-member' }] };
      return { Items: [] };
    });
    const createCognitoUser = vi.fn();

    await expect(
      completeActivation({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
    expect(createCognitoUser).not.toHaveBeenCalled();
  });

  it('traduce el conflicto de unicidad detectado en la transacción (carrera concurrente)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      // 3 ítems porque el correo de la solicitud difiere del migrado (Delete +
      // Put UniqueEmail + Update Member): la condición que falla es la del
      // Member (índice 2).
      CancellationReasons: [{ Code: 'None' }, { Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    });
    const client = fakeClient(async (command) => {
      if (ctorName(command) === 'TransactWriteCommand') throw conditionalError;
      const pk = pkOf(command);
      if (pk === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      if (pk === 'MEMBER#member-1') return { Items: [migratedMember] };
      return { Items: [] };
    });
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    await expect(
      completeActivation({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'ALREADY_ACTIVATED' });
  });

  it('activa con el correo migrado propio sin lanzar EMAIL_ALREADY_USED, aunque el UniqueEmail ya exista (bug P0-2)', async () => {
    const ownEmailRequest: CompleteActivationRequest = {
      dni: '45678912',
      email: 'Maria@Example.com',
      password: 'Sup3rSecreta!',
    };
    const memberWithOwnEmail = { ...migratedMember, email: 'maria@example.com' };

    const client = fakeClient(async (command) => {
      if (ctorName(command) === 'TransactWriteCommand') return {};
      const pk = pkOf(command);
      if (pk === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      if (pk === 'MEMBER#member-1') return { Items: [memberWithOwnEmail] };
      // El UniqueEmail del correo migrado ya existe (lo escribió la migración)
      // y apunta al mismo memberId: no debe tratarse como conflicto.
      if (pk === 'UNIQ#EMAIL#maria@example.com') return { Items: [{ memberId: 'member-1' }] };
      return { Items: [] };
    });
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    const result = await completeActivation({
      request: ownEmailRequest,
      client,
      createCognitoUser,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result.memberId).toBe('member-1');
    expect(result.memberStatus).toBe('ACTIVE');
  });

  it('al activar con un correo distinto al migrado, la transacción actualiza Member.email y borra el UniqueEmail anterior (perfil consistente)', async () => {
    let transactInput:
      | {
          TransactItems: [
            { Delete: { Key: { PK: string; SK: string } } },
            { Put: { Item: { PK: string; memberId: string } } },
            {
              Update: {
                UpdateExpression: string;
                ExpressionAttributeValues: Record<string, unknown>;
              };
            },
          ];
        }
      | undefined;

    const client = fakeClient(async (command) => {
      if (ctorName(command) === 'TransactWriteCommand') {
        transactInput = (command as { input: typeof transactInput }).input;
        return {};
      }
      const pk = pkOf(command);
      if (pk === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      if (pk === 'MEMBER#member-1') return { Items: [migratedMember] };
      if (pk?.startsWith('UNIQ#EMAIL#')) return { Items: [] };
      return { Items: [] };
    });
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    await completeActivation({
      request: validRequest,
      client,
      createCognitoUser,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(transactInput?.TransactItems).toHaveLength(3);
    const [deleteItem, putItem, updateItem] = transactInput!.TransactItems;
    expect(deleteItem.Delete.Key).toEqual({
      PK: 'UNIQ#EMAIL#antigua@example.com',
      SK: 'UNIQ#EMAIL#antigua@example.com',
    });
    expect(putItem.Put.Item).toMatchObject({
      PK: 'UNIQ#EMAIL#maria@example.com',
      memberId: 'member-1',
    });
    expect(updateItem.Update.UpdateExpression).toContain('email = :email');
    expect(updateItem.Update.ExpressionAttributeValues[':email']).toBe('maria@example.com');
  });
});
