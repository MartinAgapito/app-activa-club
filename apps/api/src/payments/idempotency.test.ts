import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { reserveIdempotencyKey, finalizeIdempotencyRecord, IDEMPOTENCY_TTL_SECONDS } =
  await import('./idempotency');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('reserveIdempotencyKey', () => {
  it('escribe el ítem con attribute_not_exists(PK) y TTL, y devuelve RESERVED la primera vez (criterio 2)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      expect(ctor).toBe('PutCommand');
      const input = (
        command as {
          input: {
            Item: Record<string, unknown>;
            ConditionExpression?: string;
          };
        }
      ).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
      expect(input.Item['PK']).toBe('IDEMP#clave-1');
      expect(input.Item['SK']).toBe('IDEMP#clave-1');
      expect(input.Item['paymentId']).toBe('payment-1');
      expect(input.Item['paymentStatus']).toBe('PENDING_CONFIRMATION');
      expect(input.Item['expiresAt']).toBe(
        Math.floor(Date.parse('2026-08-09T00:00:00.000Z') / 1000) + IDEMPOTENCY_TTL_SECONDS,
      );
      return {};
    });

    const result = await reserveIdempotencyKey(client, {
      idempotencyKey: 'clave-1',
      paymentId: 'payment-1',
      now: '2026-08-09T00:00:00.000Z',
    });

    expect(result).toEqual({ outcome: 'RESERVED' });
  });

  it('devuelve DUPLICATE con el paymentId/paymentStatus previo si la clave ya existe (criterio 2, sin cargo nuevo)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'PutCommand') {
        const conditionalError = Object.assign(new Error('condition failed'), {
          name: 'ConditionalCheckFailedException',
        });
        throw conditionalError;
      }
      if (ctor === 'QueryCommand') {
        return { Items: [{ paymentId: 'payment-original', paymentStatus: 'SUCCEEDED' }] };
      }
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const result = await reserveIdempotencyKey(client, {
      idempotencyKey: 'clave-repetida',
      paymentId: 'payment-nuevo-nunca-usado',
      now: '2026-08-09T00:00:00.000Z',
    });

    expect(result).toEqual({
      outcome: 'DUPLICATE',
      paymentId: 'payment-original',
      paymentStatus: 'SUCCEEDED',
    });
  });

  it('trata como RESERVED si la condición falla pero el ítem ya no existe (TTL vencido en el medio, defensivo)', async () => {
    const client = fakeClient(async (command) => {
      const ctor = (command as { constructor: { name: string } }).constructor.name;
      if (ctor === 'PutCommand') {
        const conditionalError = Object.assign(new Error('condition failed'), {
          name: 'ConditionalCheckFailedException',
        });
        throw conditionalError;
      }
      if (ctor === 'QueryCommand') return { Items: [] };
      throw new Error(`comando inesperado: ${ctor}`);
    });

    const result = await reserveIdempotencyKey(client, {
      idempotencyKey: 'clave-x',
      paymentId: 'payment-1',
      now: '2026-08-09T00:00:00.000Z',
    });

    expect(result).toEqual({ outcome: 'RESERVED' });
  });

  it('propaga errores no relacionados con la condición', async () => {
    const client = fakeClient(async () => {
      throw new Error('network error');
    });

    await expect(
      reserveIdempotencyKey(client, {
        idempotencyKey: 'clave-1',
        paymentId: 'payment-1',
        now: '2026-08-09T00:00:00.000Z',
      }),
    ).rejects.toThrow('network error');
  });
});

describe('finalizeIdempotencyRecord', () => {
  it('actualiza paymentStatus con condición attribute_exists(PK)', async () => {
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
      expect(input.Key).toEqual({ PK: 'IDEMP#clave-1', SK: 'IDEMP#clave-1' });
      expect(input.ConditionExpression).toBe('attribute_exists(PK)');
      expect(input.ExpressionAttributeValues[':status']).toBe('SUCCEEDED');
      return {};
    });

    await finalizeIdempotencyRecord(client, 'clave-1', 'SUCCEEDED');
  });
});
