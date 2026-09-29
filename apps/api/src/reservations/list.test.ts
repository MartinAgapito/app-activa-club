import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { listReservations } = await import('./list');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const member = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-1',
  rejectionReason: null,
  membershipType: 'MONTHLY',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00.000Z',
  membershipEndsAt: '2026-12-31T00:00:00.000Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('listReservations (US-033, criterios 1/2)', () => {
  it('scope=me resuelve al socio autenticado por cognitoSub y consulta GSI1 por su holderMemberId', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (
        cmd.input.IndexName === 'GSI1' &&
        cmd.input.ExpressionAttributeValues?.[':pk'] === 'COGNITO#sub-1'
      ) {
        return { Items: [member] };
      }
      if (cmd.input.IndexName === 'GSI1') {
        expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('MEMBER#member-1');
        return { Items: [] };
      }
      throw new Error(`Comando inesperado: ${JSON.stringify(cmd.input)}`);
    });

    const result = await listReservations({ cognitoSub: 'sub-1', scope: 'me', client });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('scope=me lanza NOT_FOUND si el cognitoSub no resuelve a ningún socio (defensivo)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(
      listReservations({ cognitoSub: 'sub-x', scope: 'me', client }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('scope=all con status consulta GSI2 (RESERVATION#STATUS#<status>)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.IndexName).toBe('GSI2');
      expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe(
        'RESERVATION#STATUS#PENDING_APPROVAL',
      );
      return { Items: [] };
    });

    await listReservations({
      cognitoSub: 'admin-sub',
      scope: 'all',
      status: 'PENDING_APPROVAL',
      client,
    });
  });

  it('scope=all con resourceId (sin status) consulta GSI3 (RESOURCE#<id>)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.IndexName).toBe('GSI3');
      expect(cmd.input.ExpressionAttributeValues?.[':pk']).toBe('RESOURCE#futbol-1');
      return { Items: [] };
    });

    await listReservations({
      cognitoSub: 'admin-sub',
      scope: 'all',
      resourceId: 'futbol-1',
      client,
    });
  });

  it('scope=all sin status ni resourceId rechaza con VALIDATION_ERROR (sin patrón de acceso "todas sin filtro")', async () => {
    const client = fakeClient(async () => {
      throw new Error('No debería consultar DynamoDB sin status ni resourceId');
    });

    await expect(
      listReservations({ cognitoSub: 'admin-sub', scope: 'all', client }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
