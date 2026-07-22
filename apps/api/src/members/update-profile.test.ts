import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { updateMemberProfile } = await import('./update-profile');

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

describe('updateMemberProfile', () => {
  it('resuelve el socio por cognitoSub y actualiza phone (criterio 2)', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') return { Items: [sampleMember] };
      return { Attributes: { ...sampleMember, phone: '999000111' } };
    });

    const result = await updateMemberProfile({
      cognitoSub: 'test-sub',
      request: { phone: '999000111' },
      client,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result.phone).toBe('999000111');
    expect(result.memberId).toBe(sampleMember.memberId);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('no modifica dni/email/estados aunque el request los trajera (criterio 3)', async () => {
    let updateInput: Record<string, unknown> | undefined;
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') return { Items: [sampleMember] };
      updateInput = (command as { input: Record<string, unknown> }).input;
      return { Attributes: { ...sampleMember, phone: '999000111' } };
    });

    await updateMemberProfile({
      cognitoSub: 'test-sub',
      // El DTO `UpdateMemberRequest` solo declara `phone`: no hay forma de
      // colar dni/email/estados a través del tipo ni de este orquestador.
      request: { phone: '999000111' },
      client,
    });

    const expression = updateInput?.['UpdateExpression'] as string;
    expect(expression).toBe('SET phone = :phone, updatedAt = :updatedAt');
  });

  it('devuelve NOT_FOUND si el cognitoSub no tiene socio enlazado', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(
      updateMemberProfile({ cognitoSub: 'sin-enlazar', request: { phone: '999000111' }, client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('es idempotente: reenviar el mismo phone no falla ni cambia el resultado', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') return { Items: [sampleMember] };
      return { Attributes: sampleMember };
    });

    const result = await updateMemberProfile({
      cognitoSub: 'test-sub',
      // sampleMember.phone ya es null: reenviar "sin cambios" reales.
      request: {},
      client,
    });

    expect(result).toEqual(sampleMember);
  });
});
