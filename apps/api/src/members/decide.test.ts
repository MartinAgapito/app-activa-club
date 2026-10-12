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
      emitNotification: vi.fn().mockResolvedValue({}),
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
      emitNotification: vi.fn().mockResolvedValue({}),
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

function decisionClient(status: 'APPROVED' | 'REJECTED') {
  return fakeClient(async (command) => {
    const ctor = (command as { constructor: { name: string } }).constructor.name;
    if (ctor === 'GetCommand') return { Item: pendingMember };
    if (ctor === 'UpdateCommand') return { Attributes: { ...pendingMember, memberStatus: status } };
    if (ctor === 'PutCommand') return {};
    throw new Error(`comando inesperado: ${ctor}`);
  });
}

const conditionalError = Object.assign(new Error('condition failed'), {
  name: 'ConditionalCheckFailedException',
});

describe('avisos al socio (US-042)', () => {
  it('la aprobación emite MEMBER_APPROVED al socio afectado, después de la auditoría', async () => {
    const client = decisionClient('APPROVED');
    const emit = vi
      .fn()
      .mockResolvedValue({ inbox: 'WRITTEN', email: 'SENT', notificationId: 'n' });

    await approveMember({
      memberId: pendingMember.memberId,
      actor,
      client,
      emitNotification: emit,
    });

    expect(emit).toHaveBeenCalledTimes(1);
    const [payload, deps] = emit.mock.calls[0] as [Record<string, unknown>, { client: unknown }];
    expect(payload).toMatchObject({
      event: 'MEMBER_APPROVED',
      data: {},
      entityId: pendingMember.memberId,
      member: { memberId: pendingMember.memberId, email: 'nuevo@example.com', firstName: 'Juan' },
    });
    expect(deps.client).toBe(client);
    // GetItem + UpdateItem + auditoría: el aviso no añade lecturas.
    expect(client.send).toHaveBeenCalledTimes(3);
  });

  it('el rechazo emite MEMBER_REJECTED con el motivo registrado', async () => {
    const client = decisionClient('REJECTED');
    const emit = vi.fn().mockResolvedValue({});

    await rejectMember({
      memberId: pendingMember.memberId,
      reason: 'Datos no verificables',
      actor,
      client,
      emitNotification: emit,
    });

    expect(emit.mock.calls[0]?.[0]).toMatchObject({
      event: 'MEMBER_REJECTED',
      data: { reason: 'Datos no verificables' },
      entityId: pendingMember.memberId,
    });
  });

  it('no emite si el socio no existe ni si la solicitud ya no estaba PENDING (409)', async () => {
    const emit = vi.fn();
    await expect(
      approveMember({
        memberId: 'no-existe',
        actor,
        client: fakeClient(async () => ({})),
        emitNotification: emit,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const conflictClient = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'GetCommand') return { Item: pendingMember };
      throw conditionalError;
    });
    await expect(
      approveMember({
        memberId: pendingMember.memberId,
        actor,
        client: conflictClient,
        emitNotification: emit,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      rejectMember({
        memberId: pendingMember.memberId,
        reason: 'motivo',
        actor,
        client: conflictClient,
        emitNotification: emit,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    expect(emit).not.toHaveBeenCalled();
  });

  it('un emisor que lanza no altera la respuesta de la aprobación ni del rechazo', async () => {
    const emit = vi.fn().mockRejectedValue(new TypeError('error de programación'));

    await expect(
      approveMember({
        memberId: pendingMember.memberId,
        actor,
        client: decisionClient('APPROVED'),
        emitNotification: emit,
      }),
    ).resolves.toEqual({ memberId: pendingMember.memberId, memberStatus: 'APPROVED' });
    await expect(
      rejectMember({
        memberId: pendingMember.memberId,
        reason: 'motivo',
        actor,
        client: decisionClient('REJECTED'),
        emitNotification: emit,
      }),
    ).resolves.toEqual({ memberId: pendingMember.memberId, memberStatus: 'REJECTED' });
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('con el emisor real, un fallo de la bandeja no cambia la respuesta y un reintento no duplica', async () => {
    const duplicate = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const transactWrites: unknown[] = [];
    let attempt = 0;
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'GetCommand') return { Item: pendingMember };
      if (ctor === 'UpdateCommand') {
        return { Attributes: { ...pendingMember, memberStatus: 'APPROVED' } };
      }
      if (ctor === 'PutCommand') return {};
      if (ctor === 'TransactWriteCommand') {
        transactWrites.push(command);
        attempt += 1;
        if (attempt === 1) throw new Error('ProvisionedThroughputExceededException');
        throw duplicate;
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const first = await approveMember({ memberId: pendingMember.memberId, actor, client });
    const second = await approveMember({ memberId: pendingMember.memberId, actor, client });

    expect(first).toEqual({ memberId: pendingMember.memberId, memberStatus: 'APPROVED' });
    expect(second).toEqual(first);
    // Mismas claves deterministas en ambos intentos: la condición evita el duplicado.
    const keysOf = (c: unknown) =>
      (
        c as { input: { TransactItems: { Put: { Item: { PK: string } } }[] } }
      ).input.TransactItems.map((t) => t.Put.Item.PK);
    expect(keysOf(transactWrites[0])).toEqual(keysOf(transactWrites[1]));
  });
});
