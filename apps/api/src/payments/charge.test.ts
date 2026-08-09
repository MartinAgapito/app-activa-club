import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreatePaymentRequest, Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createPayment } = await import('./charge');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

interface CommandLike {
  constructor: { name: string };
  input: {
    Item?: Record<string, unknown>;
    Key?: { PK: string; SK: string };
    ExpressionAttributeValues?: Record<string, unknown>;
    TransactItems?: unknown[];
  };
}

const baseMember: Omit<Member, 'memberStatus' | 'membershipStatus' | 'membershipEndsAt'> = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'NEW',
  cognitoSub: 'sub-1',
  rejectionReason: null,
  membershipType: null,
  membershipStartedAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const approvedMember: Member = {
  ...baseMember,
  memberStatus: 'APPROVED',
  membershipStatus: 'NONE',
  membershipEndsAt: null,
};

const activeMemberWithVigencia: Member = {
  ...baseMember,
  memberStatus: 'ACTIVE',
  membershipStatus: 'ACTIVE',
  membershipEndsAt: '2026-08-20T00:00:00.000Z',
};

const validRequest: CreatePaymentRequest = {
  membershipType: 'MONTHLY',
  culqiToken: 'tkn_test_xxx',
  idempotencyKey: 'idem-key-1',
};

function memberLookupResponder(member: Member | undefined) {
  return async () => (member ? { Items: [member] } : { Items: [] });
}

describe('createPayment', () => {
  it('primer pago exitoso: activa al socio y calcula membershipEndsAt desde la confirmación (criterios 1/3)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;

      if (ctor === 'QueryCommand') return { Items: [approvedMember] };
      if (ctor === 'PutCommand') return {};
      if (ctor === 'TransactWriteCommand') return {};
      if (ctor === 'UpdateCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const chargeClient = vi.fn().mockResolvedValue({ outcome: 'APPROVED', culqiChargeId: 'chr_1' });

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request: validRequest,
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-1',
      membershipId: 'membership-1',
    });

    expect(result).toEqual({
      paymentId: 'payment-1',
      paymentStatus: 'SUCCEEDED',
      membershipType: 'MONTHLY',
      amount: 12_000,
      currency: 'PEN',
      membershipEndsAt: '2026-09-09T15:00:00.000Z',
    });

    expect(chargeClient).toHaveBeenCalledWith({
      culqiToken: 'tkn_test_xxx',
      amount: 12_000,
      currency: 'PEN',
      reference: 'payment-1',
    });

    const transactCall = client.send.mock.calls.find(
      (call) => (call[0] as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const transactItems = transactCall.input.TransactItems as [
      { Update: { ExpressionAttributeValues: Record<string, unknown> } },
      { Put: { Item: Record<string, unknown> } },
      { Update: { ExpressionAttributeValues: Record<string, unknown> } },
    ];
    expect(transactItems[1].Put.Item['startedAt']).toBe('2026-08-09T15:00:00.000Z');
    expect(transactItems[1].Put.Item['endsAt']).toBe('2026-09-09T15:00:00.000Z');
    expect(transactItems[2].Update.ExpressionAttributeValues[':startedAt']).toBe(
      '2026-08-09T15:00:00.000Z',
    );
  });

  it('renovación anticipada: encadena la vigencia desde membershipEndsAt vigente (ACTIVE), no pierde días', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as CommandLike).constructor.name;
      if (ctor === 'QueryCommand') return { Items: [activeMemberWithVigencia] };
      if (ctor === 'PutCommand') return {};
      if (ctor === 'TransactWriteCommand') return {};
      if (ctor === 'UpdateCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });
    const chargeClient = vi.fn().mockResolvedValue({ outcome: 'APPROVED', culqiChargeId: 'chr_2' });

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request: { ...validRequest, membershipType: 'ANNUAL' },
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-2',
      membershipId: 'membership-2',
    });

    expect(result.membershipEndsAt).toBe('2027-08-20T00:00:00.000Z');
  });

  it('reserva la idempotencyKey antes de crear el Payment y de cobrar (criterio 2)', async () => {
    const calls: string[] = [];
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      calls.push(ctor);
      if (ctor === 'QueryCommand') return { Items: [approvedMember] };
      if (ctor === 'PutCommand') return {};
      if (ctor === 'TransactWriteCommand') return {};
      if (ctor === 'UpdateCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });
    const chargeClient = vi.fn().mockResolvedValue({ outcome: 'APPROVED', culqiChargeId: 'chr_3' });

    await createPayment({
      cognitoSub: 'sub-1',
      request: validRequest,
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-3',
      membershipId: 'membership-3',
    });

    // Query (socio) -> Put (reserva idempotencia) -> Put (Payment pendiente) -> ... -> cargo -> TransactWrite -> Update (finaliza idempotencia)
    expect(calls[0]).toBe('QueryCommand');
    expect(calls[1]).toBe('PutCommand');
    expect(calls[2]).toBe('PutCommand');
    expect(chargeClient).toHaveBeenCalledTimes(1);
  });

  it('idempotencyKey repetida: no genera cargo nuevo y responde PAYMENT_DUPLICATE (409, criterio 2)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as CommandLike).constructor.name;
      if (ctor === 'QueryCommand') {
        const cmd = command as CommandLike;
        const pk = cmd.input.ExpressionAttributeValues?.[':pk'];
        if (pk === 'COGNITO#sub-1') return { Items: [approvedMember] };
        return { Items: [{ paymentId: 'payment-original', paymentStatus: 'SUCCEEDED' }] };
      }
      if (ctor === 'PutCommand') {
        throw Object.assign(new Error('condition failed'), {
          name: 'ConditionalCheckFailedException',
        });
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });
    const chargeClient = vi.fn();

    await expect(
      createPayment({
        cognitoSub: 'sub-1',
        request: validRequest,
        client,
        chargeClient,
        now: new Date('2026-08-09T15:00:00.000Z'),
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_DUPLICATE',
      details: [
        { field: 'paymentId', issue: 'payment-original' },
        { field: 'paymentStatus', issue: 'SUCCEEDED' },
      ],
    });
    expect(chargeClient).not.toHaveBeenCalled();
  });

  it('pago rechazado: responde PAYMENT_FAILED (422), persiste el Payment como FAILED y no toca la membresía (criterio 4)', async () => {
    const calls: string[] = [];
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      calls.push(ctor);
      if (ctor === 'QueryCommand') return { Items: [approvedMember] };
      if (ctor === 'PutCommand') return {};
      if (ctor === 'UpdateCommand') return {};
      if (ctor === 'TransactWriteCommand') {
        throw new Error('no debería llamarse: la membresía no cambia en un pago fallido');
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });
    const chargeClient = vi
      .fn()
      .mockResolvedValue({ outcome: 'DECLINED', reason: 'Tarjeta rechazada por el emisor.' });

    await expect(
      createPayment({
        cognitoSub: 'sub-1',
        request: validRequest,
        client,
        chargeClient,
        now: new Date('2026-08-09T15:00:00.000Z'),
        paymentId: 'payment-4',
      }),
    ).rejects.toMatchObject({
      code: 'PAYMENT_FAILED',
      message: 'Tarjeta rechazada por el emisor.',
    });

    expect(calls).not.toContain('TransactWriteCommand');
    const failUpdate = client.send.mock.calls.find((call) => {
      const cmd = call[0] as CommandLike;
      return (
        cmd.constructor.name === 'UpdateCommand' &&
        cmd.input.ExpressionAttributeValues?.[':failed'] === 'FAILED'
      );
    })?.[0] as CommandLike;
    expect(failUpdate.input.ExpressionAttributeValues?.[':reason']).toBe(
      'Tarjeta rechazada por el emisor.',
    );
  });

  it('respuesta ambigua/perdida de Culqi: el pago queda PENDING_CONFIRMATION y la membresía no se activa (criterio 5)', async () => {
    const calls: string[] = [];
    const client = fakeClient(async (command) => {
      const ctor = (command as CommandLike).constructor.name;
      calls.push(ctor);
      if (ctor === 'QueryCommand') return { Items: [approvedMember] };
      if (ctor === 'PutCommand') return {};
      if (ctor === 'TransactWriteCommand' || ctor === 'UpdateCommand') {
        throw new Error('no debería llamarse: sin confirmación no hay cambios');
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });
    const chargeClient = vi.fn().mockRejectedValue(new Error('timeout de red'));

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request: validRequest,
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-5',
    });

    expect(result).toEqual({
      paymentId: 'payment-5',
      paymentStatus: 'PENDING_CONFIRMATION',
      membershipType: 'MONTHLY',
      amount: 12_000,
      currency: 'PEN',
      membershipEndsAt: null,
    });
    expect(calls).not.toContain('TransactWriteCommand');
    expect(calls).not.toContain('UpdateCommand');
  });

  it('socio PENDING no puede pagar: MEMBER_NOT_APPROVED (403) y ningún cargo (criterio 7)', async () => {
    const client = fakeClient(
      memberLookupResponder({ ...approvedMember, memberStatus: 'PENDING' }),
    );
    const chargeClient = vi.fn();

    await expect(
      createPayment({ cognitoSub: 'sub-1', request: validRequest, client, chargeClient }),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_APPROVED' });
    expect(chargeClient).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('socio con DEBT/EXPIRED (memberStatus ACTIVE) sí puede pagar y regulariza su saldo (criterio 8)', async () => {
    const debtMember: Member = {
      ...baseMember,
      memberStatus: 'ACTIVE',
      membershipStatus: 'DEBT',
      membershipEndsAt: '2026-07-01T00:00:00.000Z',
      outstandingBalance: 5_000,
    };
    const client = fakeClient(async (command) => {
      const ctor = (command as CommandLike).constructor.name;
      if (ctor === 'QueryCommand') return { Items: [debtMember] };
      return {};
    });
    const chargeClient = vi.fn().mockResolvedValue({ outcome: 'APPROVED', culqiChargeId: 'chr_6' });

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request: validRequest,
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-6',
    });

    // membershipStatus=DEBT no encadena (no es ACTIVE/EXPIRING_SOON): parte de la fecha de confirmación.
    expect(result.membershipEndsAt).toBe('2026-09-09T15:00:00.000Z');
  });

  it('devuelve NOT_FOUND (404) si el cognitoSub no resuelve ningún socio (defensivo)', async () => {
    const client = fakeClient(memberLookupResponder(undefined));
    const chargeClient = vi.fn();

    await expect(
      createPayment({ cognitoSub: 'sub-desconocido', request: validRequest, client, chargeClient }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(chargeClient).not.toHaveBeenCalled();
  });

  it('autoRenew=true se refleja en el Member solo al confirmarse el pago (criterio 11)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as CommandLike).constructor.name;
      if (ctor === 'QueryCommand') return { Items: [approvedMember] };
      return {};
    });
    const chargeClient = vi.fn().mockResolvedValue({ outcome: 'APPROVED', culqiChargeId: 'chr_7' });

    await createPayment({
      cognitoSub: 'sub-1',
      request: { ...validRequest, autoRenew: true },
      client,
      chargeClient,
      now: new Date('2026-08-09T15:00:00.000Z'),
      paymentId: 'payment-7',
      membershipId: 'membership-7',
    });

    const transactCall = client.send.mock.calls.find(
      (call) => (call[0] as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const transactItems = transactCall.input.TransactItems as [
      unknown,
      unknown,
      { Update: { ExpressionAttributeValues: Record<string, unknown> } },
    ];
    expect(transactItems[2].Update.ExpressionAttributeValues[':autoRenew']).toBe(true);
  });

  it('un membershipType no soportado por la configuración de planes responde VALIDATION_ERROR (criterio 6)', async () => {
    const client = fakeClient(memberLookupResponder(approvedMember));
    const chargeClient = vi.fn();

    await expect(
      createPayment({
        cognitoSub: 'sub-1',
        request: { ...validRequest, membershipType: 'WEEKLY' as never },
        client,
        chargeClient,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(chargeClient).not.toHaveBeenCalled();
  });
});
