import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { findMemberByCognitoSub, updateMemberContact } = await import('./repository');

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
