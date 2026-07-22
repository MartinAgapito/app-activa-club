import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { RegistrationRequest } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { registerMember } = await import('./register');

const validRequest: RegistrationRequest = {
  dni: '10203040',
  email: 'Nuevo@Example.com',
  password: 'Sup3rSecreta!',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '999000111',
};

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('registerMember', () => {
  it('crea el socio PENDING y el usuario Cognito para datos válidos y únicos (criterio 1)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    const result = await registerMember({
      request: validRequest,
      client,
      createCognitoUser,
      memberId: 'member-1',
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result).toEqual({ memberId: 'member-1', memberStatus: 'PENDING' });
    expect(createCognitoUser).toHaveBeenCalledWith({
      email: 'nuevo@example.com',
      password: 'Sup3rSecreta!',
    });
    // 2 Query de verificación previa (DNI, correo) + 1 TransactWriteCommand.
    expect(client.send).toHaveBeenCalledTimes(3);
  });

  it('devuelve DNI_ALREADY_USED (409) sin crear usuario Cognito si el DNI ya existe (criterio 2/4)', async () => {
    const client = fakeClient(async (command) => {
      const input = (command as { input: { ExpressionAttributeValues: Record<string, string> } })
        .input;
      if (input.ExpressionAttributeValues[':pk'] === 'UNIQ#DNI#10203040') {
        return { Items: [{ memberId: 'existing-member' }] };
      }
      return { Items: [] };
    });
    const createCognitoUser = vi.fn();

    await expect(
      registerMember({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'DNI_ALREADY_USED' });
    expect(createCognitoUser).not.toHaveBeenCalled();
  });

  it('devuelve EMAIL_ALREADY_USED (409) sin crear usuario Cognito si el correo ya existe', async () => {
    const client = fakeClient(async (command) => {
      const input = (command as { input: { ExpressionAttributeValues: Record<string, string> } })
        .input;
      if (input.ExpressionAttributeValues[':pk'] === 'UNIQ#EMAIL#nuevo@example.com') {
        return { Items: [{ memberId: 'existing-member' }] };
      }
      return { Items: [] };
    });
    const createCognitoUser = vi.fn();

    await expect(
      registerMember({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
    expect(createCognitoUser).not.toHaveBeenCalled();
  });

  it('traduce el conflicto de unicidad detectado en la transacción (carrera concurrente)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
    });
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'TransactWriteCommand') throw conditionalError;
      return { Items: [] };
    });
    const createCognitoUser = vi.fn().mockResolvedValue('cognito-sub-1');

    await expect(
      registerMember({ request: validRequest, client, createCognitoUser }),
    ).rejects.toMatchObject({ code: 'DNI_ALREADY_USED' });
  });
});
