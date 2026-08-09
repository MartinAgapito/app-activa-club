import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createPendingPayment, markPaymentFailed, confirmPaymentSuccess } =
  await import('./repository');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('createPendingPayment', () => {
  it('escribe el Payment inicial en PENDING_CONFIRMATION sin datos de tarjeta (criterio 9)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      expect(ctor).toBe('PutCommand');
      const input = (
        command as { input: { Item: Record<string, unknown>; ConditionExpression?: string } }
      ).input;
      expect(input.Item).toEqual({
        PK: 'MEMBER#member-1',
        SK: 'PAYMENT#2026-08-09T00:00:00.000Z#payment-1',
        GSI2PK: 'PAYMENT#STATUS#PENDING_CONFIRMATION',
        GSI2SK: '2026-08-09T00:00:00.000Z#payment-1',
        entityType: 'Payment',
        paymentId: 'payment-1',
        memberId: 'member-1',
        membershipType: 'MONTHLY',
        amount: 12_000,
        currency: 'PEN',
        paymentStatus: 'PENDING_CONFIRMATION',
        culqiChargeId: null,
        idempotencyKey: 'clave-1',
        autoRenewRequested: false,
        failureReason: null,
        createdAt: '2026-08-09T00:00:00.000Z',
        confirmedAt: null,
      });
      expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
      return {};
    });

    await createPendingPayment(client, {
      memberId: 'member-1',
      paymentId: 'payment-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      membershipType: 'MONTHLY',
      amount: 12_000,
      currency: 'PEN',
      idempotencyKey: 'clave-1',
      autoRenewRequested: false,
    });
  });
});

describe('markPaymentFailed', () => {
  it('actualiza el Payment a FAILED con failureReason, condicionado a que siga PENDING_CONFIRMATION', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      expect(ctor).toBe('UpdateCommand');
      const input = (
        command as {
          input: {
            Key: { PK: string; SK: string };
            ConditionExpression?: string;
            ExpressionAttributeValues: Record<string, unknown>;
          };
        }
      ).input;
      expect(input.Key).toEqual({
        PK: 'MEMBER#member-1',
        SK: 'PAYMENT#2026-08-09T00:00:00.000Z#payment-1',
      });
      expect(input.ConditionExpression).toBe('attribute_exists(PK) AND paymentStatus = :pending');
      expect(input.ExpressionAttributeValues[':failed']).toBe('FAILED');
      expect(input.ExpressionAttributeValues[':reason']).toBe('Tarjeta rechazada por el emisor.');
      expect(input.ExpressionAttributeValues[':gsi2pk']).toBe('PAYMENT#STATUS#FAILED');
      return {};
    });

    await markPaymentFailed(client, {
      memberId: 'member-1',
      paymentId: 'payment-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      failureReason: 'Tarjeta rechazada por el emisor.',
    });
  });
});

describe('confirmPaymentSuccess', () => {
  it('actualiza Payment + crea MembershipPeriod + actualiza Member en una única transacción (criterio 3)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      expect(ctor).toBe('TransactWriteCommand');
      const input = (
        command as {
          input: {
            TransactItems: [
              {
                Update: {
                  Key: unknown;
                  ConditionExpression?: string;
                  UpdateExpression: string;
                  ExpressionAttributeValues: Record<string, unknown>;
                };
              },
              { Put: { Item: Record<string, unknown> } },
              {
                Update: {
                  Key: unknown;
                  ConditionExpression?: string;
                  UpdateExpression: string;
                  ExpressionAttributeValues: Record<string, unknown>;
                };
              },
            ];
          };
        }
      ).input;

      const [paymentUpdate, membershipPut, memberUpdate] = input.TransactItems;

      expect(paymentUpdate.Update.Key).toEqual({
        PK: 'MEMBER#member-1',
        SK: 'PAYMENT#2026-08-09T00:00:00.000Z#payment-1',
      });
      expect(paymentUpdate.Update.ConditionExpression).toBe(
        'attribute_exists(PK) AND paymentStatus = :pending',
      );
      expect(paymentUpdate.Update.ExpressionAttributeValues[':succeeded']).toBe('SUCCEEDED');
      expect(paymentUpdate.Update.ExpressionAttributeValues[':chargeId']).toBe('chr_test_1');
      expect(paymentUpdate.Update.ExpressionAttributeValues[':paymentGsi2pk']).toBe(
        'PAYMENT#STATUS#SUCCEEDED',
      );

      expect(membershipPut.Put.Item).toMatchObject({
        PK: 'MEMBER#member-1',
        SK: 'MEMBERSHIP#2026-08-09T15:00:00.000Z#membership-1',
        GSI2PK: 'MEMBERSHIP#ACTIVE',
        GSI2SK: '2026-09-09T15:00:00.000Z',
        entityType: 'MembershipPeriod',
        membershipId: 'membership-1',
        type: 'MONTHLY',
        startedAt: '2026-08-09T15:00:00.000Z',
        endsAt: '2026-09-09T15:00:00.000Z',
        status: 'ACTIVE',
        paymentId: 'payment-1',
      });

      expect(memberUpdate.Update.Key).toEqual({ PK: 'MEMBER#member-1', SK: 'PROFILE' });
      expect(memberUpdate.Update.ConditionExpression).toBe('attribute_exists(PK)');
      expect(memberUpdate.Update.ExpressionAttributeValues[':activeMemberStatus']).toBe('ACTIVE');
      expect(memberUpdate.Update.ExpressionAttributeValues[':activeMembershipStatus']).toBe(
        'ACTIVE',
      );
      expect(memberUpdate.Update.ExpressionAttributeValues[':zero']).toBe(0);
      expect(memberUpdate.Update.ExpressionAttributeValues[':memberGsi2pk']).toBe(
        'MEMBER#STATUS#ACTIVE',
      );
      expect(memberUpdate.Update.UpdateExpression).not.toContain('autoRenew');

      return {};
    });

    await confirmPaymentSuccess(client, {
      memberId: 'member-1',
      paymentId: 'payment-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      culqiChargeId: 'chr_test_1',
      confirmedAt: '2026-08-09T00:00:00.000Z',
      membershipId: 'membership-1',
      membershipType: 'MONTHLY',
      cycleStartedAt: '2026-08-09T15:00:00.000Z',
      cycleEndsAt: '2026-09-09T15:00:00.000Z',
      autoRenewRequested: false,
    });
  });

  it('incluye autoRenew=true en el Member solo si se solicitó explícitamente (criterio 11)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            TransactItems: [
              unknown,
              unknown,
              {
                Update: {
                  UpdateExpression: string;
                  ExpressionAttributeValues: Record<string, unknown>;
                };
              },
            ];
          };
        }
      ).input;
      const [, , memberUpdate] = input.TransactItems;
      expect(memberUpdate.Update.UpdateExpression).toContain('autoRenew = :autoRenew');
      expect(memberUpdate.Update.ExpressionAttributeValues[':autoRenew']).toBe(true);
      return {};
    });

    await confirmPaymentSuccess(client, {
      memberId: 'member-1',
      paymentId: 'payment-1',
      createdAt: '2026-08-09T00:00:00.000Z',
      culqiChargeId: 'chr_test_1',
      confirmedAt: '2026-08-09T00:00:00.000Z',
      membershipId: 'membership-1',
      membershipType: 'ANNUAL',
      cycleStartedAt: '2026-08-09T15:00:00.000Z',
      cycleEndsAt: '2027-08-09T15:00:00.000Z',
      autoRenewRequested: true,
    });
  });
});
