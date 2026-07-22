import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const {
  findMemberByCognitoSub,
  updateMemberContact,
  getMemberById,
  listMembersByStatus,
  transitionMemberStatus,
} = await import('./repository');

const sampleMember: Member = {
  memberId: '01J000000000000000000TEST',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'MIGRATED',
  memberStatus: 'ACTIVE',
  cognitoSub: 'test-sub',
  rejectionReason: null,
  membershipType: 'ANNUAL',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-15T00:00:00Z',
  membershipEndsAt: '2027-01-15T00:00:00Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('findMemberByCognitoSub', () => {
  it('consulta GSI1 por COGNITO#<sub> y devuelve el Member encontrado', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: { IndexName?: string; ExpressionAttributeValues: Record<string, string> };
        }
      ).input;
      expect(input.IndexName).toBe('GSI1');
      expect(input.ExpressionAttributeValues[':pk']).toBe('COGNITO#test-sub');
      expect(input.ExpressionAttributeValues[':sk']).toBe('MEMBER');
      return { Items: [sampleMember] };
    });

    const result = await findMemberByCognitoSub(client, 'test-sub');

    expect(result?.memberId).toBe(sampleMember.memberId);
  });

  it('devuelve undefined si no hay ningún socio enlazado a ese cognitoSub', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(findMemberByCognitoSub(client, 'sin-enlazar')).resolves.toBeUndefined();
  });
});

describe('updateMemberContact', () => {
  it('actualiza solo phone y updatedAt con condición attribute_exists(PK)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            Key: { PK: string; SK: string };
            ConditionExpression?: string;
            ExpressionAttributeValues: Record<string, unknown>;
          };
        }
      ).input;
      expect(input.Key).toEqual({ PK: 'MEMBER#01J000000000000000000TEST', SK: 'PROFILE' });
      expect(input.ConditionExpression).toBe('attribute_exists(PK)');
      expect(input.ExpressionAttributeValues[':phone']).toBe('999000111');
      expect(input.ExpressionAttributeValues[':updatedAt']).toBe('2026-07-21T00:00:00.000Z');
      return { Attributes: { ...sampleMember, phone: '999000111' } };
    });

    const result = await updateMemberContact(
      client,
      sampleMember.memberId,
      { phone: '999000111' },
      '2026-07-21T00:00:00.000Z',
    );

    expect(result.phone).toBe('999000111');
  });
});

describe('getMemberById', () => {
  it('lee el Member por PK/SK y lo devuelve', async () => {
    const client = fakeClient(async (command) => {
      const input = (command as { input: { Key: { PK: string; SK: string } } }).input;
      expect(input.Key).toEqual({ PK: 'MEMBER#01J000000000000000000TEST', SK: 'PROFILE' });
      return { Item: sampleMember };
    });

    const result = await getMemberById(client, sampleMember.memberId);
    expect(result?.memberId).toBe(sampleMember.memberId);
  });

  it('devuelve undefined si no existe el ítem (404 en el llamante)', async () => {
    const client = fakeClient(async () => ({}));
    await expect(getMemberById(client, 'no-existe')).resolves.toBeUndefined();
  });
});

describe('listMembersByStatus', () => {
  const pendingMember: typeof sampleMember = { ...sampleMember, memberStatus: 'PENDING' };

  it('consulta GSI2 por MEMBER#STATUS#<status> y adapta a MemberSummary', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            IndexName?: string;
            ExpressionAttributeValues: Record<string, string>;
            Limit?: number;
            ExclusiveStartKey?: unknown;
          };
        }
      ).input;
      expect(input.IndexName).toBe('GSI2');
      expect(input.ExpressionAttributeValues[':pk']).toBe('MEMBER#STATUS#PENDING');
      expect(input.Limit).toBe(20);
      expect(input.ExclusiveStartKey).toBeUndefined();
      return {
        Items: [pendingMember],
        LastEvaluatedKey: {
          PK: 'MEMBER#x',
          SK: 'PROFILE',
          GSI2PK: 'MEMBER#STATUS#PENDING',
          GSI2SK: 'x',
        },
      };
    });

    const result = await listMembersByStatus(client, 'PENDING');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      memberId: pendingMember.memberId,
      dni: pendingMember.dni,
      firstName: pendingMember.firstName,
      lastName: pendingMember.lastName,
      origin: pendingMember.origin,
      memberStatus: 'PENDING',
      membershipStatus: pendingMember.membershipStatus,
      createdAt: pendingMember.createdAt,
    });
    expect(result.nextCursor).not.toBeNull();
  });

  it('devuelve nextCursor null cuando no hay más páginas', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    const result = await listMembersByStatus(client, 'PENDING');
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('decodifica el cursor recibido como ExclusiveStartKey y respeta el limit', async () => {
    const key = { PK: 'MEMBER#a', SK: 'PROFILE', GSI2PK: 'MEMBER#STATUS#PENDING', GSI2SK: 'a' };
    const cursor = Buffer.from(JSON.stringify(key), 'utf-8').toString('base64url');

    const client = fakeClient(async (command) => {
      const input = (command as { input: { Limit?: number; ExclusiveStartKey?: unknown } }).input;
      expect(input.Limit).toBe(5);
      expect(input.ExclusiveStartKey).toEqual(key);
      return { Items: [] };
    });

    await listMembersByStatus(client, 'PENDING', { cursor, limit: 5 });
  });
});

describe('transitionMemberStatus', () => {
  it('aprueba con UpdateItem condicionado a memberStatus = PENDING', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            ConditionExpression?: string;
            UpdateExpression?: string;
            ExpressionAttributeValues: Record<string, unknown>;
          };
        }
      ).input;
      expect(input.ConditionExpression).toBe('attribute_exists(PK) AND memberStatus = :pending');
      expect(input.UpdateExpression).toBe('SET memberStatus = :status, updatedAt = :now');
      expect(input.ExpressionAttributeValues[':status']).toBe('APPROVED');
      return { Attributes: { ...sampleMember, memberStatus: 'APPROVED' } };
    });

    const result = await transitionMemberStatus(
      client,
      sampleMember.memberId,
      { to: 'APPROVED' },
      '2026-07-21T00:00:00.000Z',
    );

    expect(result).not.toBe('NOT_PENDING');
    expect((result as typeof sampleMember).memberStatus).toBe('APPROVED');
  });

  it('rechaza incluyendo rejectionReason en el UpdateExpression', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: { UpdateExpression?: string; ExpressionAttributeValues: Record<string, unknown> };
        }
      ).input;
      expect(input.UpdateExpression).toBe(
        'SET memberStatus = :status, rejectionReason = :reason, updatedAt = :now',
      );
      expect(input.ExpressionAttributeValues[':reason']).toBe('Datos no verificables');
      return {
        Attributes: {
          ...sampleMember,
          memberStatus: 'REJECTED',
          rejectionReason: 'Datos no verificables',
        },
      };
    });

    const result = await transitionMemberStatus(
      client,
      sampleMember.memberId,
      { to: 'REJECTED', rejectionReason: 'Datos no verificables' },
      '2026-07-21T00:00:00.000Z',
    );

    expect((result as typeof sampleMember).rejectionReason).toBe('Datos no verificables');
  });

  it('devuelve NOT_PENDING si la condición falla (ya no está PENDING o no existe)', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = fakeClient(async () => {
      throw conditionalError;
    });

    await expect(
      transitionMemberStatus(client, sampleMember.memberId, { to: 'APPROVED' }),
    ).resolves.toBe('NOT_PENDING');
  });

  it('propaga errores no relacionados con la condición', async () => {
    const client = fakeClient(async () => {
      throw new Error('network error');
    });

    await expect(
      transitionMemberStatus(client, sampleMember.memberId, { to: 'APPROVED' }),
    ).rejects.toThrow('network error');
  });
});
