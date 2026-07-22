import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { approveMember, rejectMember } = await import('./decide');

const pendingMember: Member = {
  memberId: '01J000000000000000000TEST',
  legacyId: null,
  dni: '10203040',
  email: 'nuevo@example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: null,
  origin: 'NEW',
  memberStatus: 'PENDING',
  cognitoSub: 'cognito-sub-1',
  rejectionReason: null,
  membershipType: null,
  membershipStatus: 'NONE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const actor = { actorId: 'admin-1', actorRole: 'admin' as const };

describe('approveMember', () => {
  it('transiciona PENDING -> APPROVED y registra auditoría MEMBER_APPROVED (criterio 3)', async () => {
    const calls: string[] = [];
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      calls.push(ctor);
      if (ctor === 'GetCommand') return { Item: pendingMember };
      if (ctor === 'UpdateCommand') {
        return { Attributes: { ...pendingMember, memberStatus: 'APPROVED' } };
      }
      if (ctor === 'PutCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const result = await approveMember({
      memberId: pendingMember.memberId,
      actor,
      client,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result).toEqual({ memberId: pendingMember.memberId, memberStatus: 'APPROVED' });
    expect(calls).toEqual(['GetCommand', 'UpdateCommand', 'PutCommand']);

    const auditCall = client.send.mock.calls[2]?.[0] as {
      input: { Item: Record<string, unknown> };
    };
    expect(auditCall.input.Item['action']).toBe('MEMBER_APPROVED');
    expect(auditCall.input.Item['targetId']).toBe(pendingMember.memberId);
  });

  it('devuelve NOT_FOUND (404) si el memberId no existe', async () => {
    const client = fakeClient(async () => ({}));

    await expect(approveMember({ memberId: 'no-existe', actor, client })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('devuelve CONFLICT (409) si el socio ya no está PENDING (dos admins actuando a la vez)', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'GetCommand') return { Item: { ...pendingMember, memberStatus: 'APPROVED' } };
      if (ctor === 'UpdateCommand') throw conditionalError;
      throw new Error(`comando inesperado: ${ctor}`);
    });

    await expect(
      approveMember({ memberId: pendingMember.memberId, actor, client }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('rejectMember', () => {
  it('transiciona PENDING -> REJECTED con motivo y registra auditoría MEMBER_REJECTED (criterio 4)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'GetCommand') return { Item: pendingMember };
      if (ctor === 'UpdateCommand') {
        return {
          Attributes: {
            ...pendingMember,
            memberStatus: 'REJECTED',
            rejectionReason: 'Datos no verificables',
          },
        };
      }
      if (ctor === 'PutCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const result = await rejectMember({
      memberId: pendingMember.memberId,
      reason: 'Datos no verificables',
      actor,
      client,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result).toEqual({ memberId: pendingMember.memberId, memberStatus: 'REJECTED' });

    const auditCall = client.send.mock.calls[2]?.[0] as {
      input: { Item: Record<string, unknown> };
    };
    expect(auditCall.input.Item['action']).toBe('MEMBER_REJECTED');
    expect(auditCall.input.Item['metadata']).toEqual({ reason: 'Datos no verificables' });
  });

  it('devuelve NOT_FOUND (404) si el memberId no existe', async () => {
    const client = fakeClient(async () => ({}));

    await expect(
      rejectMember({ memberId: 'no-existe', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('devuelve CONFLICT (409) si el socio ya no está PENDING', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'GetCommand') return { Item: { ...pendingMember, memberStatus: 'REJECTED' } };
      if (ctor === 'UpdateCommand') throw conditionalError;
      throw new Error(`comando inesperado: ${ctor}`);
    });

    await expect(
      rejectMember({ memberId: pendingMember.memberId, reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
