import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { processCulqiWebhookEvent } = await import('./webhook');

interface CommandLike {
  constructor: { name: string };
  input: {
    Item?: Record<string, unknown>;
    Key?: { PK: string; SK: string };
    ExpressionAttributeValues?: Record<string, unknown>;
    TransactItems?: unknown[];
  };
}

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const pendingPaymentItem = {
  memberId: 'member-1',
  paymentId: 'payment-1',
  createdAt: '2026-08-09T00:00:00.000Z',
  paymentStatus: 'PENDING_CONFIRMATION',
  membershipType: 'MONTHLY',
  amount: 12_000,
  currency: 'PEN',
  culqiChargeId: null,
  idempotencyKey: 'idem-1',
  autoRenewRequested: false,
  failureReason: null,
  confirmedAt: null,
};

const approvedMember: Member = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'NEW',
  cognitoSub: 'sub-1',
  memberStatus: 'APPROVED',
  rejectionReason: null,
  membershipType: null,
  membershipStatus: 'NONE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** Enruta un `QueryCommand` de GSI2 al item correspondiente según el estado consultado. */
function queryByStatusResponder(itemsByStatus: Record<string, unknown[]>) {
  return (command: CommandLike) => {
    const pk = command.input.ExpressionAttributeValues?.[':pk'] as string;
    const status = pk.replace('PAYMENT#STATUS#', '');
    return { Items: itemsByStatus[status] ?? [] };
  };
}

const succeededEvent = {
  type: 'charge.succeeded' as const,
  data: { object: { id: 'chr_test_1', metadata: { reference: 'payment-1' } } },
};

const failedEvent = {
  type: 'charge.failed' as const,
  data: {
    object: {
      id: 'chr_test_2',
      metadata: { reference: 'payment-1' },
      outcome: { user_message: 'Tarjeta rechazada por el emisor.' },
    },
  },
};

describe('processCulqiWebhookEvent', () => {
  it('confirma un pago PENDING_CONFIRMATION y activa la membresía (criterio 3)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({ PENDING_CONFIRMATION: [pendingPaymentItem] })(cmd);
      }
      if (ctor === 'GetCommand') return { Item: approvedMember };
      if (ctor === 'TransactWriteCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-1',
      client,
      now: new Date('2026-08-09T15:00:00.000Z'),
      membershipId: 'membership-1',
    });

    expect(outcome).toBe('CONFIRMED');

    const transactCall = client.send.mock.calls.find(
      (call) => (call[0] as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const transactItems = transactCall.input.TransactItems as [
      { Update: { ExpressionAttributeValues: Record<string, unknown> } },
      { Put: { Item: Record<string, unknown> } },
      unknown,
    ];
    expect(transactItems[0].Update.ExpressionAttributeValues[':chargeId']).toBe('chr_test_1');
    expect(transactItems[1].Put.Item['startedAt']).toBe('2026-08-09T15:00:00.000Z');
    expect(transactItems[1].Put.Item['endsAt']).toBe('2026-09-09T15:00:00.000Z');

    // Solo se consultó la primera partición (PENDING_CONFIRMATION): el caso
    // común no necesita recorrer las otras dos.
    const queryCalls = client.send.mock.calls.filter(
      (call) => (call[0] as CommandLike).constructor.name === 'QueryCommand',
    );
    expect(queryCalls).toHaveLength(1);
  });

  it('marca un pago PENDING_CONFIRMATION como FAILED sin tocar la membresía (criterio 6)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({ PENDING_CONFIRMATION: [pendingPaymentItem] })(cmd);
      }
      if (ctor === 'UpdateCommand') return {};
      throw new Error(`no debería llamarse: ${ctor} (fallo no activa membresía)`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: failedEvent,
      requestId: 'req-2',
      client,
    });

    expect(outcome).toBe('FAILED_RECORDED');
    const updateCall = client.send.mock.calls.find(
      (call) => (call[0] as CommandLike).constructor.name === 'UpdateCommand',
    )?.[0] as CommandLike;
    expect(updateCall.input.ExpressionAttributeValues?.[':reason']).toBe(
      'Tarjeta rechazada por el emisor.',
    );
  });

  it('un evento sobre un pago ya SUCCEEDED no produce ningún cambio (criterio 4/10, convergencia)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({
          SUCCEEDED: [{ ...pendingPaymentItem, paymentStatus: 'SUCCEEDED' }],
        })(cmd);
      }
      throw new Error(`no debería llamarse: ${ctor} (idempotente, sin efectos)`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-3',
      client,
    });

    expect(outcome).toBe('ALREADY_RESOLVED');
  });

  it('un evento fallido llegado después de uno exitoso no revierte el pago ya SUCCEEDED (caso alternativo, criterio 10)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({
          SUCCEEDED: [{ ...pendingPaymentItem, paymentStatus: 'SUCCEEDED' }],
        })(cmd);
      }
      throw new Error(`no debería llamarse: ${ctor} (evento fuera de orden, sin revertir)`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: failedEvent,
      requestId: 'req-4',
      client,
    });

    expect(outcome).toBe('ALREADY_RESOLVED');
  });

  it('idempotencia estricta: el mismo evento recibido dos veces produce el mismo estado final (criterio 2)', async () => {
    let confirmed = false;
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder(
          confirmed
            ? { SUCCEEDED: [{ ...pendingPaymentItem, paymentStatus: 'SUCCEEDED' }] }
            : { PENDING_CONFIRMATION: [pendingPaymentItem] },
        )(cmd);
      }
      if (ctor === 'GetCommand') return { Item: approvedMember };
      if (ctor === 'TransactWriteCommand') {
        confirmed = true;
        return {};
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const first = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-5a',
      client,
      now: new Date('2026-08-09T15:00:00.000Z'),
      membershipId: 'membership-1',
    });
    const second = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-5b',
      client,
      now: new Date('2026-08-09T15:05:00.000Z'),
      membershipId: 'membership-1',
    });

    expect(first).toBe('CONFIRMED');
    expect(second).toBe('ALREADY_RESOLVED');
    const transactCalls = client.send.mock.calls.filter(
      (call) => (call[0] as CommandLike).constructor.name === 'TransactWriteCommand',
    );
    expect(transactCalls).toHaveLength(1);
  });

  it('pierde una carrera con la confirmación síncrona (ConditionalCheckFailedException) y converge sin error (criterio 10)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({ PENDING_CONFIRMATION: [pendingPaymentItem] })(cmd);
      }
      if (ctor === 'GetCommand') return { Item: approvedMember };
      if (ctor === 'TransactWriteCommand') {
        throw Object.assign(new Error('condition failed'), {
          name: 'ConditionalCheckFailedException',
        });
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-6',
      client,
    });

    expect(outcome).toBe('ALREADY_RESOLVED');
  });

  it('un evento sobre un paymentId inexistente no produce efectos (criterio 6/7)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'QueryCommand') return { Items: [] };
      throw new Error(`no debería llamarse: ${cmd.constructor.name}`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-7',
      client,
    });

    expect(outcome).toBe('PAYMENT_NOT_FOUND');
  });

  it('defensivo: el Payment existe pero el socio referido ya no (sin efectos)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({ PENDING_CONFIRMATION: [pendingPaymentItem] })(cmd);
      }
      if (ctor === 'GetCommand') return { Item: undefined };
      throw new Error(`no debería llamarse: ${ctor}`);
    });

    const outcome = await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-8',
      client,
    });

    expect(outcome).toBe('PAYMENT_NOT_FOUND');
  });

  it('renovación anticipada: encadena la vigencia desde membershipEndsAt vigente (mismas reglas de US-021)', async () => {
    const activeMember: Member = {
      ...approvedMember,
      memberStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
      membershipEndsAt: '2026-08-20T00:00:00.000Z',
    };
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        return queryByStatusResponder({
          PENDING_CONFIRMATION: [{ ...pendingPaymentItem, membershipType: 'ANNUAL' }],
        })(cmd);
      }
      if (ctor === 'GetCommand') return { Item: activeMember };
      if (ctor === 'TransactWriteCommand') return {};
      throw new Error(`comando inesperado: ${ctor}`);
    });

    await processCulqiWebhookEvent({
      event: succeededEvent,
      requestId: 'req-9',
      client,
      now: new Date('2026-08-09T15:00:00.000Z'),
      membershipId: 'membership-1',
    });

    const transactCall = client.send.mock.calls.find(
      (call) => (call[0] as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const transactItems = transactCall.input.TransactItems as [
      unknown,
      { Put: { Item: Record<string, unknown> } },
      unknown,
    ];
    expect(transactItems[1].Put.Item['startedAt']).toBe('2026-08-20T00:00:00.000Z');
    expect(transactItems[1].Put.Item['endsAt']).toBe('2027-08-20T00:00:00.000Z');
  });
});
