import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { updateMemberAutoRenew } = await import('./update-auto-renew');

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

describe('updateMemberAutoRenew', () => {
  it('resuelve el socio por cognitoSub y activa autoRenew (criterio 6)', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') return { Items: [sampleMember] };
      return { Attributes: { ...sampleMember, autoRenew: true } };
    });

    const result = await updateMemberAutoRenew({
      cognitoSub: 'test-sub',
      enabled: true,
      client,
      now: new Date('2026-07-21T00:00:00Z'),
    });

    expect(result.autoRenew).toBe(true);
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('desactiva autoRenew con efecto inmediato (criterio 7)', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') return { Items: [{ ...sampleMember, autoRenew: true }] };
      return { Attributes: { ...sampleMember, autoRenew: false } };
    });

    const result = await updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: false, client });

    expect(result.autoRenew).toBe(false);
  });

  it('no acepta ningún memberId de la solicitud: solo el cognitoSub decide qué socio se modifica (criterio 9)', async () => {
    let queriedSub: string | undefined;
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') {
        const input = (command as { input: { ExpressionAttributeValues: Record<string, string> } })
          .input;
        queriedSub = input.ExpressionAttributeValues[':pk'];
        return { Items: [sampleMember] };
      }
      return { Attributes: { ...sampleMember, autoRenew: true } };
    });

    // La firma de `UpdateMemberAutoRenewInput` no admite un `memberId`: no hay
    // forma de que este llamado afecte a un socio distinto del dueño de
    // `cognitoSub` — no es una validación de tiempo de ejecución, es que el
    // tipo mismo no permite expresarlo.
    await updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: true, client });

    expect(queriedSub).toBe('COGNITO#test-sub');
  });

  it('devuelve NOT_FOUND si el cognitoSub no tiene socio enlazado', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(
      updateMemberAutoRenew({ cognitoSub: 'sin-enlazar', enabled: true, client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rechaza con MEMBER_NOT_APPROVED si el socio está PENDING', async () => {
    const client = fakeClient(async () => ({
      Items: [{ ...sampleMember, memberStatus: 'PENDING' }],
    }));

    await expect(
      updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: true, client }),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_APPROVED' });
  });

  it('rechaza con MEMBER_NOT_APPROVED si el socio está REJECTED', async () => {
    const client = fakeClient(async () => ({
      Items: [{ ...sampleMember, memberStatus: 'REJECTED' }],
    }));

    await expect(
      updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: true, client }),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_APPROVED' });
  });

  it('permite el cambio a un socio APPROVED aunque aún no haya pagado su primera membresía', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') {
        return { Items: [{ ...sampleMember, memberStatus: 'APPROVED' }] };
      }
      return { Attributes: { ...sampleMember, memberStatus: 'APPROVED', autoRenew: true } };
    });

    const result = await updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: true, client });

    expect(result.autoRenew).toBe(true);
  });

  it('permite desactivar a un socio ACTIVE con deuda o vencido (RN-PAG-06)', async () => {
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'QueryCommand') {
        return { Items: [{ ...sampleMember, membershipStatus: 'DEBT', autoRenew: true }] };
      }
      return { Attributes: { ...sampleMember, membershipStatus: 'DEBT', autoRenew: false } };
    });

    const result = await updateMemberAutoRenew({ cognitoSub: 'test-sub', enabled: false, client });

    expect(result.autoRenew).toBe(false);
  });
});
