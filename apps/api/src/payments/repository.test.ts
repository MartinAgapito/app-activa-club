import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const {
  createPendingPayment,
  markPaymentFailed,
  confirmPaymentSuccess,
  listPaymentsByMember,
  listPaymentsByStatus,
  getPaymentByMemberAndId,
  findPaymentById,
} = await import('./repository');

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

// --- Lectura: historial de pagos (US-025) ---

function buildPaymentItem(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    PK: 'MEMBER#member-1',
    SK: 'PAYMENT#2026-08-01T00:00:00.000Z#payment-1',
    GSI2PK: 'PAYMENT#STATUS#SUCCEEDED',
    GSI2SK: '2026-08-01T00:00:00.000Z#payment-1',
    entityType: 'Payment',
    paymentId: 'payment-1',
    memberId: 'member-1',
    membershipType: 'MONTHLY',
    amount: 12_000,
    currency: 'PEN',
    paymentStatus: 'SUCCEEDED',
    culqiChargeId: 'chr_test_1',
    idempotencyKey: 'clave-secreta-interna',
    autoRenewRequested: false,
    failureReason: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    confirmedAt: '2026-08-01T00:05:00.000Z',
    ...overrides,
  };
}

describe('listPaymentsByMember', () => {
  it('consulta PK=MEMBER#<id> con begins_with(SK,"PAYMENT#"), más reciente primero (criterio 1)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      expect(ctor).toBe('QueryCommand');
      const input = (
        command as {
          input: {
            TableName: string;
            IndexName?: string;
            KeyConditionExpression: string;
            FilterExpression?: string;
            ExpressionAttributeValues: Record<string, unknown>;
            ScanIndexForward?: boolean;
            Limit?: number;
          };
        }
      ).input;
      expect(input.IndexName).toBeUndefined();
      expect(input.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :prefix)');
      expect(input.ExpressionAttributeValues[':pk']).toBe('MEMBER#member-1');
      expect(input.ExpressionAttributeValues[':prefix']).toBe('PAYMENT#');
      expect(input.FilterExpression).toBeUndefined();
      expect(input.ScanIndexForward).toBe(false);
      return { Items: [buildPaymentItem()] };
    });

    const result = await listPaymentsByMember(client, 'member-1');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      paymentId: 'payment-1',
      memberId: 'member-1',
      membershipType: 'MONTHLY',
      amount: 12_000,
      currency: 'PEN',
      paymentStatus: 'SUCCEEDED',
      culqiChargeId: 'chr_test_1',
      createdAt: '2026-08-01T00:00:00.000Z',
      confirmedAt: '2026-08-01T00:05:00.000Z',
    });
    // Nunca expone idempotencyKey ni failureReason (criterio 7, RN-PAG-08).
    expect(result.items[0]).not.toHaveProperty('idempotencyKey');
    expect(result.items[0]).not.toHaveProperty('failureReason');
    expect(result.nextCursor).toBeNull();
  });

  it('aplica FilterExpression por paymentStatus cuando se filtra por status (criterio 3/4)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: { FilterExpression?: string; ExpressionAttributeValues: Record<string, unknown> };
        }
      ).input;
      expect(input.FilterExpression).toBe('paymentStatus = :status');
      expect(input.ExpressionAttributeValues[':status']).toBe('FAILED');
      return { Items: [] };
    });

    await listPaymentsByMember(client, 'member-1', { status: 'FAILED' });
  });

  it('devuelve una lista vacía si el socio no tiene pagos (caso alternativo)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    const result = await listPaymentsByMember(client, 'member-sin-pagos');

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it('propaga LastEvaluatedKey como nextCursor opaco (paginación)', async () => {
    const client = fakeClient(async () => ({
      Items: [buildPaymentItem()],
      LastEvaluatedKey: { PK: 'MEMBER#member-1', SK: 'PAYMENT#2026-08-01T00:00:00.000Z#payment-1' },
    }));

    const result = await listPaymentsByMember(client, 'member-1');

    expect(typeof result.nextCursor).toBe('string');
    expect(result.nextCursor).not.toBeNull();
  });
});

describe('listPaymentsByStatus', () => {
  it('consulta GSI2PK=PAYMENT#STATUS#<status>, más reciente primero (criterio 3, admin sin memberId)', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            IndexName?: string;
            KeyConditionExpression: string;
            ExpressionAttributeValues: Record<string, unknown>;
            ScanIndexForward?: boolean;
          };
        }
      ).input;
      expect(input.IndexName).toBe('GSI2');
      expect(input.KeyConditionExpression).toBe('GSI2PK = :pk');
      expect(input.ExpressionAttributeValues[':pk']).toBe('PAYMENT#STATUS#FAILED');
      expect(input.ScanIndexForward).toBe(false);
      return {
        Items: [buildPaymentItem({ paymentStatus: 'FAILED', GSI2PK: 'PAYMENT#STATUS#FAILED' })],
      };
    });

    const result = await listPaymentsByStatus(client, 'FAILED');

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.paymentStatus).toBe('FAILED');
  });
});

describe('getPaymentByMemberAndId', () => {
  it('devuelve el pago propio si existe en la partición del socio', async () => {
    const client = fakeClient(async () => ({ Items: [buildPaymentItem()] }));

    const payment = await getPaymentByMemberAndId(client, 'member-1', 'payment-1');

    expect(payment?.paymentId).toBe('payment-1');
  });

  it('devuelve undefined si el pago no existe en la partición del socio (ajeno o inexistente)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    const payment = await getPaymentByMemberAndId(client, 'member-1', 'payment-ajeno');

    expect(payment).toBeUndefined();
  });

  it('recorre páginas siguiendo LastEvaluatedKey hasta encontrar el paymentId', async () => {
    let call = 0;
    const client = fakeClient(async () => {
      call += 1;
      if (call === 1) {
        return {
          Items: [],
          LastEvaluatedKey: { PK: 'MEMBER#member-1', SK: 'PAYMENT#2026-08-01T00:00:00.000Z#otro' },
        };
      }
      return { Items: [buildPaymentItem()] };
    });

    const payment = await getPaymentByMemberAndId(client, 'member-1', 'payment-1');

    expect(payment?.paymentId).toBe('payment-1');
    expect(call).toBe(2);
  });
});

describe('findPaymentById', () => {
  it('recorre las particiones de GSI2 por estado hasta encontrar el pago (admin, sin memberId)', async () => {
    const calls: string[] = [];
    const client = fakeClient(async (command) => {
      const input = (command as { input: { ExpressionAttributeValues: Record<string, unknown> } })
        .input;
      const status = input.ExpressionAttributeValues[':pk'] as string;
      calls.push(status);
      if (status === 'PAYMENT#STATUS#SUCCEEDED') {
        return { Items: [buildPaymentItem()] };
      }
      return { Items: [] };
    });

    const payment = await findPaymentById(client, 'payment-1');

    expect(payment?.paymentId).toBe('payment-1');
    // PENDING_CONFIRMATION se prueba antes que SUCCEEDED (orden de PAYMENT_STATUSES).
    expect(calls[0]).toBe('PAYMENT#STATUS#PENDING_CONFIRMATION');
    expect(calls).toContain('PAYMENT#STATUS#SUCCEEDED');
  });

  it('devuelve undefined si el paymentId no existe en ninguna partición de estado (criterio 6)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    const payment = await findPaymentById(client, 'payment-inexistente');

    expect(payment).toBeUndefined();
  });
});
