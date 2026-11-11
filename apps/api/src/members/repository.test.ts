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
  updateMemberAutoRenew,
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

describe('updateMemberAutoRenew', () => {
  it('activa autoRenew con condición attribute_exists(PK)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            Key: { PK: string; SK: string };
            ConditionExpression?: string;
            UpdateExpression?: string;
            ExpressionAttributeValues: Record<string, unknown>;
          };
        }
      ).input;
      expect(input.Key).toEqual({ PK: 'MEMBER#01J000000000000000000TEST', SK: 'PROFILE' });
      expect(input.ConditionExpression).toBe('attribute_exists(PK)');
      expect(input.UpdateExpression).toBe('SET autoRenew = :autoRenew, updatedAt = :updatedAt');
      expect(input.ExpressionAttributeValues[':autoRenew']).toBe(true);
      expect(input.ExpressionAttributeValues[':updatedAt']).toBe('2026-07-21T00:00:00.000Z');
      return { Attributes: { ...sampleMember, autoRenew: true } };
    });

    const result = await updateMemberAutoRenew(
      client,
      sampleMember.memberId,
      true,
      '2026-07-21T00:00:00.000Z',
    );

    expect(result.autoRenew).toBe(true);
  });

  it('desactiva autoRenew (efecto inmediato, criterio 7)', async () => {
    const client = fakeClient(async (command) => {
      const input = (command as { input: { ExpressionAttributeValues: Record<string, unknown> } })
        .input;
      expect(input.ExpressionAttributeValues[':autoRenew']).toBe(false);
      return { Attributes: { ...sampleMember, autoRenew: false } };
    });

    const result = await updateMemberAutoRenew(client, sampleMember.memberId, false);

    expect(result.autoRenew).toBe(false);
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
      membershipEndsAt: pendingMember.membershipEndsAt,
      outstandingBalance: pendingMember.outstandingBalance,
      createdAt: pendingMember.createdAt,
    });
    // Sin filtro: una sola lectura sin FilterExpression (comportamiento de US-051).
    const sent = client.send.mock.calls[0]?.[0] as { input: { FilterExpression?: string } };
    expect(sent.input.FilterExpression).toBeUndefined();
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

function memberItem(n: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const id = `01J${String(n).padStart(3, '0')}`;
  return {
    ...sampleMember,
    memberId: id,
    PK: `MEMBER#${id}`,
    SK: 'PROFILE',
    GSI2PK: 'MEMBER#STATUS#ACTIVE',
    GSI2SK: `2026-01-01T00:00:00Z#${id}`,
    ...overrides,
  };
}

function cursorOf(value: unknown): unknown {
  return JSON.parse(Buffer.from(value as string, 'base64url').toString('utf-8'));
}

describe('listMembersByStatus con membershipStatus (US-052, patrón #28)', () => {
  type QueryInput = {
    IndexName?: string;
    KeyConditionExpression?: string;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues: Record<string, unknown>;
    Limit?: number;
    ExclusiveStartKey?: unknown;
  };
  const inputOf = (client: { send: ReturnType<typeof vi.fn> }, call: number): QueryInput =>
    (client.send.mock.calls[call]?.[0] as { input: QueryInput }).input;

  it.each(['EXPIRED', 'EXPIRING_SOON', 'ACTIVE', 'NONE'] as const)(
    '%s: Query de GSI2 con FilterExpression de igualdad y sin Scan',
    async (membershipStatus) => {
      const client = fakeClient(async () => ({
        Items: [memberItem(1, { membershipStatus })],
      }));

      const result = await listMembersByStatus(client, 'ACTIVE', { membershipStatus });

      const input = inputOf(client, 0);
      expect(input.IndexName).toBe('GSI2');
      expect(input.KeyConditionExpression).toBe('GSI2PK = :pk');
      expect(input.FilterExpression).toBe('#ms = :ms');
      expect(input.ExpressionAttributeNames).toEqual({ '#ms': 'membershipStatus' });
      expect(input.ExpressionAttributeValues).toEqual({
        ':pk': 'MEMBER#STATUS#ACTIVE',
        ':ms': membershipStatus,
      });
      expect(input.Limit).toBe(100);
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    },
  );

  it('DEBT: incluye membershipStatus = DEBT o outstandingBalance > 0', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await listMembersByStatus(client, 'MIGRATED', { membershipStatus: 'DEBT' });

    const input = inputOf(client, 0);
    expect(input.FilterExpression).toBe('#ms = :ms OR #ob > :zero');
    expect(input.ExpressionAttributeNames).toEqual({
      '#ms': 'membershipStatus',
      '#ob': 'outstandingBalance',
    });
    expect(input.ExpressionAttributeValues).toEqual({
      ':pk': 'MEMBER#STATUS#MIGRATED',
      ':ms': 'DEBT',
      ':zero': 0,
    });
  });

  it('usa la partición del status pedido (combinación status + membershipStatus)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));
    await listMembersByStatus(client, 'APPROVED', { membershipStatus: 'NONE' });
    expect(inputOf(client, 0).ExpressionAttributeValues[':pk']).toBe('MEMBER#STATUS#APPROVED');
  });

  it('enriquece con membershipEndsAt y outstandingBalance y no expone datos sensibles', async () => {
    const client = fakeClient(async () => ({
      Items: [
        memberItem(1, {
          membershipStatus: 'DEBT',
          membershipEndsAt: '2026-09-30T05:00:00.000Z',
          outstandingBalance: 12000,
        }),
      ],
    }));

    const result = await listMembersByStatus(client, 'ACTIVE', { membershipStatus: 'DEBT' });

    expect(result.items[0]).toEqual({
      memberId: '01J001',
      dni: sampleMember.dni,
      firstName: sampleMember.firstName,
      lastName: sampleMember.lastName,
      origin: sampleMember.origin,
      memberStatus: 'ACTIVE',
      membershipStatus: 'DEBT',
      membershipEndsAt: '2026-09-30T05:00:00.000Z',
      outstandingBalance: 12000,
      createdAt: sampleMember.createdAt,
    });
    const keysReturned = Object.keys(result.items[0] ?? {});
    for (const forbidden of ['email', 'phone', 'cognitoSub', 'rejectionReason', 'legacyId']) {
      expect(keysReturned).not.toContain(forbidden);
    }
  });

  it('socio que nunca pagó: membershipEndsAt null y outstandingBalance 0 (aunque falten atributos)', async () => {
    const raw = memberItem(1, { membershipStatus: 'NONE' });
    delete raw['membershipEndsAt'];
    delete raw['outstandingBalance'];
    const client = fakeClient(async () => ({ Items: [raw] }));

    const result = await listMembersByStatus(client, 'ACTIVE', { membershipStatus: 'NONE' });

    expect(result.items[0]?.membershipEndsAt).toBeNull();
    expect(result.items[0]?.outstandingBalance).toBe(0);
  });

  it('encadena lecturas hasta reunir limit sin pasar del presupuesto', async () => {
    let call = 0;
    const client = fakeClient(async () => {
      call += 1;
      return {
        Items: call === 3 ? [memberItem(30), memberItem(31)] : [],
        LastEvaluatedKey: { PK: `MEMBER#r${call}`, SK: 'PROFILE', GSI2PK: 'p', GSI2SK: `r${call}` },
      };
    });

    const result = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'DEBT',
      limit: 2,
    });

    expect(client.send).toHaveBeenCalledTimes(3);
    expect(inputOf(client, 1).ExclusiveStartKey).toEqual({
      PK: 'MEMBER#r1',
      SK: 'PROFILE',
      GSI2PK: 'p',
      GSI2SK: 'r1',
    });
    expect(result.items.map((i) => i.memberId)).toEqual(['01J030', '01J031']);
  });

  it('con más coincidencias que limit devuelve limit y el cursor del último devuelto', async () => {
    const client = fakeClient(async () => ({
      Items: [memberItem(1), memberItem(2), memberItem(3)],
      LastEvaluatedKey: { PK: 'MEMBER#x', SK: 'PROFILE', GSI2PK: 'p', GSI2SK: 'x' },
    }));

    const result = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'ACTIVE',
      limit: 2,
    });

    expect(client.send).toHaveBeenCalledTimes(1);
    expect(result.items.map((i) => i.memberId)).toEqual(['01J001', '01J002']);
    expect(cursorOf(result.nextCursor)).toEqual({
      PK: 'MEMBER#01J002',
      SK: 'PROFILE',
      GSI2PK: 'MEMBER#STATUS#ACTIVE',
      GSI2SK: '2026-01-01T00:00:00Z#01J002',
    });
  });

  it('exactamente limit coincidencias con partición agotada: nextCursor null', async () => {
    const client = fakeClient(async () => ({ Items: [memberItem(1), memberItem(2)] }));

    const result = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'ACTIVE',
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBeNull();
  });

  it('agota las 5 lecturas sin coincidencias: página vacía con nextCursor no nulo', async () => {
    const client = fakeClient(async () => ({
      Items: [],
      LastEvaluatedKey: { PK: 'MEMBER#z', SK: 'PROFILE', GSI2PK: 'p', GSI2SK: 'z' },
    }));

    const result = await listMembersByStatus(client, 'ACTIVE', { membershipStatus: 'EXPIRED' });

    expect(client.send).toHaveBeenCalledTimes(5);
    expect(result.items).toEqual([]);
    expect(result.nextCursor).not.toBeNull();
  });

  it('partición agotada antes del presupuesto: nextCursor null (fin real)', async () => {
    let call = 0;
    const client = fakeClient(async () => {
      call += 1;
      return call === 1
        ? { Items: [], LastEvaluatedKey: { PK: 'a', SK: 'b', GSI2PK: 'p', GSI2SK: 'a' } }
        : { Items: [memberItem(1)] };
    });

    const result = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'EXPIRED',
      limit: 5,
    });

    expect(client.send).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it('paginación sin saltar ni repetir: cada página arranca tras el último devuelto', async () => {
    const all = [memberItem(1), memberItem(2), memberItem(3), memberItem(4), memberItem(5)];
    const client = fakeClient(async (command) => {
      const start = (command as { input: { ExclusiveStartKey?: { PK: string } } }).input
        .ExclusiveStartKey;
      const from = start ? all.findIndex((m) => m['PK'] === start['PK']) + 1 : 0;
      return { Items: all.slice(from) };
    });

    const first = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'DEBT',
      limit: 2,
    });
    const second = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'DEBT',
      limit: 2,
      cursor: first.nextCursor as string,
    });
    const third = await listMembersByStatus(client, 'ACTIVE', {
      membershipStatus: 'DEBT',
      limit: 2,
      cursor: second.nextCursor as string,
    });

    const ids = [...first.items, ...second.items, ...third.items].map((i) => i.memberId);
    expect(ids).toEqual(['01J001', '01J002', '01J003', '01J004', '01J005']);
    expect(third.nextCursor).toBeNull();
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
      expect(input.UpdateExpression).toBe(
        'SET memberStatus = :status, GSI2PK = :gsi2pk, updatedAt = :now',
      );
      expect(input.ExpressionAttributeValues[':status']).toBe('APPROVED');
      expect(input.ExpressionAttributeValues[':gsi2pk']).toBe('MEMBER#STATUS#APPROVED');
      return {
        Attributes: { ...sampleMember, memberStatus: 'APPROVED', GSI2PK: 'MEMBER#STATUS#APPROVED' },
      };
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

  it('actualiza GSI2PK a MEMBER#STATUS#REJECTED al rechazar (queda indexado para GET /members?status=REJECTED)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: { ExpressionAttributeValues: Record<string, unknown> };
        }
      ).input;
      expect(input.ExpressionAttributeValues[':gsi2pk']).toBe('MEMBER#STATUS#REJECTED');
      return {
        Attributes: {
          ...sampleMember,
          memberStatus: 'REJECTED',
          rejectionReason: 'Datos no verificables',
          GSI2PK: 'MEMBER#STATUS#REJECTED',
        },
      };
    });

    await transitionMemberStatus(
      client,
      sampleMember.memberId,
      { to: 'REJECTED', rejectionReason: 'Datos no verificables' },
      '2026-07-21T00:00:00.000Z',
    );
  });

  it('rechaza incluyendo rejectionReason en el UpdateExpression', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: { UpdateExpression?: string; ExpressionAttributeValues: Record<string, unknown> };
        }
      ).input;
      expect(input.UpdateExpression).toBe(
        'SET memberStatus = :status, GSI2PK = :gsi2pk, rejectionReason = :reason, updatedAt = :now',
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
