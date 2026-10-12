// US-043: avisos del resultado de un pago desde los dos caminos que lo
// resuelven (cobro síncrono y webhook), con el emisor real de US-040 sobre un
// DynamoDB simulado, y con un emisor inyectado cuando se prueba el efecto.

import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { CreatePaymentRequest, Member } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createPayment } = await import('./charge');
const { processStripeWebhookEvent } = await import('./webhook');

interface CommandLike {
  constructor: { name: string };
  input: {
    ExpressionAttributeValues?: Record<string, unknown>;
    TransactItems?: { Put?: { Item: Record<string, unknown> } }[];
  };
}

const member: Member = {
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

const request: CreatePaymentRequest = {
  membershipType: 'MONTHLY',
  stripePaymentMethodId: 'pm_test_secret_method',
  idempotencyKey: 'idem-key-1',
};

const pendingPayment = {
  memberId: 'member-1',
  paymentId: 'payment-1',
  createdAt: '2026-08-09T00:00:00.000Z',
  paymentStatus: 'PENDING_CONFIRMATION',
  membershipType: 'MONTHLY',
  amount: 12_000,
  currency: 'PEN',
  stripePaymentIntentId: null,
  idempotencyKey: 'idem-1',
  autoRenewRequested: false,
  failureReason: null,
  confirmedAt: null,
};

const succeededEvent = {
  type: 'payment_intent.succeeded' as const,
  data: { object: { id: 'pi_test_secret_intent', metadata: { paymentId: 'payment-1' } } },
};

const failedEvent = {
  type: 'payment_intent.payment_failed' as const,
  data: {
    object: {
      id: 'pi_test_secret_intent',
      metadata: { paymentId: 'payment-1' },
      last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
    },
  },
};

const NOW = new Date('2026-08-09T15:00:00.000Z');

type FakeClient = DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> };

function fakeClient(send: (command: CommandLike) => unknown): FakeClient {
  return {
    send: vi.fn(async (command: unknown) => send(command as CommandLike)),
  } as unknown as FakeClient;
}

/** Ítems `Notification` escritos en la bandeja por el emisor real. */
function notificationPuts(client: FakeClient): Record<string, unknown>[] {
  return client.send.mock.calls
    .map((call) => call[0] as CommandLike)
    .filter((cmd) => cmd.constructor.name === 'TransactWriteCommand')
    .flatMap((cmd) => cmd.input.TransactItems ?? [])
    .map((item) => item.Put?.Item)
    .filter((item): item is Record<string, unknown> => item?.['entityType'] === 'Notification');
}

function chargeClientOk() {
  return vi.fn().mockResolvedValue({ outcome: 'SUCCEEDED', stripePaymentIntentId: 'pi_test_1' });
}

function paymentsBackend(options: { notificationFails?: boolean } = {}) {
  return fakeClient((cmd) => {
    const ctor = cmd.constructor.name;
    if (ctor === 'QueryCommand') {
      const pk = cmd.input.ExpressionAttributeValues?.[':pk'] as string | undefined;
      if (pk?.startsWith('PAYMENT#STATUS#')) {
        return {
          Items: pk === 'PAYMENT#STATUS#PENDING_CONFIRMATION' ? [pendingPayment] : [],
        };
      }
      return { Items: [member] };
    }
    if (ctor === 'GetCommand') return { Item: member };
    if (ctor === 'TransactWriteCommand') {
      const isNotification = cmd.input.TransactItems?.some(
        (item) => item.Put?.Item['entityType'] === 'Notification',
      );
      if (isNotification && options.notificationFails) {
        throw new Error('DynamoDB caído');
      }
      return {};
    }
    return {};
  });
}

function noSensitiveData(text: string): void {
  expect(text).not.toMatch(/pm_test|pi_test|\b4242\b|cvc|cvv|sk_test|whsec_/i);
  expect(text).not.toContain('45678912'); // DNI
}

describe('US-043: aviso del resultado del cobro síncrono', () => {
  it('pago exitoso: deja un PAYMENT_SUCCEEDED en la bandeja con plan, monto y vigencia', async () => {
    const client = paymentsBackend();

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request,
      client,
      chargeClient: chargeClientOk(),
      now: NOW,
      paymentId: 'payment-1',
      membershipId: 'membership-1',
    });

    expect(result.paymentStatus).toBe('SUCCEEDED');
    const notices = notificationPuts(client);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      event: 'PAYMENT_SUCCEEDED',
      targetMemberId: 'member-1',
      createdBy: 'SYSTEM',
    });
    const text = `${notices[0]?.['title'] as string} ${notices[0]?.['body'] as string}`;
    expect(text).toContain('S/ 120');
    noSensitiveData(text);
  });

  it('tarjeta rechazada: deja un PAYMENT_FAILED con el motivo del catálogo y la respuesta 422 no cambia', async () => {
    const client = paymentsBackend();
    const chargeClient = vi
      .fn()
      .mockResolvedValue({ outcome: 'DECLINED', reason: 'Fondos insuficientes.' });

    await expect(
      createPayment({
        cognitoSub: 'sub-1',
        request,
        client,
        chargeClient,
        now: NOW,
        paymentId: 'payment-1',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_FAILED', message: 'Fondos insuficientes.' });

    const notices = notificationPuts(client);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ event: 'PAYMENT_FAILED', targetMemberId: 'member-1' });
    const text = `${notices[0]?.['title'] as string} ${notices[0]?.['body'] as string}`;
    expect(text).toContain('Fondos insuficientes.');
    noSensitiveData(text);
  });

  it('pago en verificación (AMBIGUOUS): no emite ningún aviso', async () => {
    const notifier = vi.fn();
    const client = paymentsBackend();

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request,
      client,
      chargeClient: vi.fn().mockResolvedValue({ outcome: 'AMBIGUOUS' }),
      notifier,
      now: NOW,
      paymentId: 'payment-1',
    });

    expect(result.paymentStatus).toBe('PENDING_CONFIRMATION');
    expect(notifier).not.toHaveBeenCalled();
  });

  it('un fallo del emisor no cambia la respuesta ni el estado del pago', async () => {
    const notifier = vi.fn().mockRejectedValue(new Error('SES y DynamoDB caídos'));
    const client = paymentsBackend();

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request,
      client,
      chargeClient: chargeClientOk(),
      notifier,
      now: NOW,
      paymentId: 'payment-1',
      membershipId: 'membership-1',
    });

    expect(notifier).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ paymentId: 'payment-1', paymentStatus: 'SUCCEEDED' });
  });

  it('un fallo real de la bandeja (DynamoDB) tampoco afecta al pago confirmado', async () => {
    const client = paymentsBackend({ notificationFails: true });

    const result = await createPayment({
      cognitoSub: 'sub-1',
      request,
      client,
      chargeClient: chargeClientOk(),
      now: NOW,
      paymentId: 'payment-1',
      membershipId: 'membership-1',
    });

    expect(result.paymentStatus).toBe('SUCCEEDED');
  });

  it('PAYMENT_DUPLICATE: no emite aviso', async () => {
    const notifier = vi.fn();
    const client = fakeClient((cmd) => {
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') return { Items: [member] };
      if (ctor === 'PutCommand') {
        const error = new Error('duplicado');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      if (ctor === 'GetCommand') {
        return { Item: { paymentId: 'payment-0', paymentStatus: 'SUCCEEDED' } };
      }
      return {};
    });

    await expect(
      createPayment({
        cognitoSub: 'sub-1',
        request,
        client,
        chargeClient: chargeClientOk(),
        notifier,
        now: NOW,
        paymentId: 'payment-1',
      }),
    ).rejects.toBeDefined();
    expect(notifier).not.toHaveBeenCalled();
  });
});

describe('US-043: aviso desde el webhook', () => {
  it('confirma un pago pendiente: un PAYMENT_SUCCEEDED con el monto del pago y la vigencia calculada', async () => {
    const client = paymentsBackend();

    const outcome = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-1',
      client,
      now: NOW,
      membershipId: 'membership-1',
    });

    expect(outcome).toBe('CONFIRMED');
    const notices = notificationPuts(client);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ event: 'PAYMENT_SUCCEEDED', targetMemberId: 'member-1' });
    const text = `${notices[0]?.['title'] as string} ${notices[0]?.['body'] as string}`;
    expect(text).toContain('S/ 120');
    noSensitiveData(text);
  });

  it('marca un pago pendiente como FAILED: un PAYMENT_FAILED con el motivo propio, sin códigos de Stripe', async () => {
    const client = paymentsBackend();

    const outcome = await processStripeWebhookEvent({
      event: failedEvent,
      requestId: 'req-2',
      client,
      now: NOW,
    });

    expect(outcome).toBe('FAILED_RECORDED');
    const notices = notificationPuts(client);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ event: 'PAYMENT_FAILED', targetMemberId: 'member-1' });
    const text = `${notices[0]?.['title'] as string} ${notices[0]?.['body'] as string}`;
    expect(text).toContain('Fondos insuficientes.');
    expect(text).not.toMatch(/insufficient_funds|card_declined/);
    noSensitiveData(text);
  });

  it('pago ya confirmado por el cobro síncrono: el webhook no avisa de nuevo', async () => {
    const notifier = vi.fn();
    const client = fakeClient((cmd) => {
      if (cmd.constructor.name === 'QueryCommand') {
        const pk = cmd.input.ExpressionAttributeValues?.[':pk'] as string;
        return {
          Items:
            pk === 'PAYMENT#STATUS#SUCCEEDED'
              ? [{ ...pendingPayment, paymentStatus: 'SUCCEEDED' }]
              : [],
        };
      }
      return {};
    });

    const outcome = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-3',
      client,
      notifier,
      now: NOW,
    });

    expect(outcome).toBe('ALREADY_RESOLVED');
    expect(notifier).not.toHaveBeenCalled();
  });

  it('webhook repetido: solo la primera entrega avisa', async () => {
    const notifier = vi.fn().mockResolvedValue(undefined);
    let confirmed = false;
    const client = fakeClient((cmd) => {
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        const pk = cmd.input.ExpressionAttributeValues?.[':pk'] as string;
        if (confirmed) {
          return {
            Items:
              pk === 'PAYMENT#STATUS#SUCCEEDED'
                ? [{ ...pendingPayment, paymentStatus: 'SUCCEEDED' }]
                : [],
          };
        }
        return { Items: pk === 'PAYMENT#STATUS#PENDING_CONFIRMATION' ? [pendingPayment] : [] };
      }
      if (ctor === 'GetCommand') return { Item: member };
      if (ctor === 'TransactWriteCommand') confirmed = true;
      return {};
    });

    const first = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-4a',
      client,
      notifier,
      now: NOW,
      membershipId: 'membership-1',
    });
    const second = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-4b',
      client,
      notifier,
      now: NOW,
      membershipId: 'membership-1',
    });

    expect([first, second]).toEqual(['CONFIRMED', 'ALREADY_RESOLVED']);
    expect(notifier).toHaveBeenCalledTimes(1);
    expect(notifier).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'member-1' }),
      expect.objectContaining({ event: 'PAYMENT_SUCCEEDED', paymentId: 'payment-1' }),
      expect.anything(),
    );
  });

  it('carrera perdida contra otra confirmación (condición fallida): no avisa', async () => {
    const notifier = vi.fn();
    const client = fakeClient((cmd) => {
      const ctor = cmd.constructor.name;
      if (ctor === 'QueryCommand') {
        const pk = cmd.input.ExpressionAttributeValues?.[':pk'] as string;
        return { Items: pk === 'PAYMENT#STATUS#PENDING_CONFIRMATION' ? [pendingPayment] : [] };
      }
      if (ctor === 'GetCommand') return { Item: member };
      if (ctor === 'TransactWriteCommand') {
        const error = new Error('cancelada');
        error.name = 'ConditionalCheckFailedException';
        throw error;
      }
      return {};
    });

    const outcome = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-5',
      client,
      notifier,
      now: NOW,
      membershipId: 'membership-1',
    });

    expect(outcome).toBe('ALREADY_RESOLVED');
    expect(notifier).not.toHaveBeenCalled();
  });

  it('un fallo del emisor no cambia el resultado ni hace fallar al webhook', async () => {
    const notifier = vi.fn().mockRejectedValue(new Error('SES caído'));
    const client = paymentsBackend();

    const outcome = await processStripeWebhookEvent({
      event: failedEvent,
      requestId: 'req-6',
      client,
      notifier,
      now: NOW,
    });

    expect(outcome).toBe('FAILED_RECORDED');
    expect(notifier).toHaveBeenCalledTimes(1);
  });

  it('un fallo real de la bandeja no hace fallar al webhook', async () => {
    const client = paymentsBackend({ notificationFails: true });

    const outcome = await processStripeWebhookEvent({
      event: succeededEvent,
      requestId: 'req-7',
      client,
      now: NOW,
      membershipId: 'membership-1',
    });

    expect(outcome).toBe('CONFIRMED');
  });
});
