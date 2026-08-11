import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Resource } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { listResources } = await import('./repository');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const futbol1: Resource = {
  resourceId: 'futbol-1',
  type: 'FUTBOL',
  name: 'Cancha de fútbol 1',
  capacity: 14,
  blockMinutes: 90,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

const piscina1: Resource = {
  resourceId: 'piscina-1',
  type: 'PISCINA',
  name: 'Piscina',
  capacity: 5,
  blockMinutes: 120,
  opensAt: '08:00',
  closesAt: '20:00',
  requiresApproval: false,
  resourceStatus: 'MAINTENANCE',
};

describe('listResources', () => {
  it('escanea la tabla filtrando por PK que empieza con RESOURCE# y SK=METADATA', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            TableName?: string;
            FilterExpression?: string;
            ExpressionAttributeValues?: Record<string, string>;
          };
        }
      ).input;
      expect(input.TableName).toBe('activa-club-test');
      expect(input.FilterExpression).toBe('begins_with(PK, :prefix) AND SK = :metadata');
      expect(input.ExpressionAttributeValues).toEqual({
        ':prefix': 'RESOURCE#',
        ':metadata': 'METADATA',
      });
      return { Items: [futbol1, piscina1] };
    });

    const result = await listResources(client);

    expect(result).toHaveLength(2);
    expect(result.map((resource) => resource.resourceId)).toEqual(['futbol-1', 'piscina-1']);
  });

  it('devuelve una lista vacía sin error cuando el catálogo aún no se cargó', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(listResources(client)).resolves.toEqual([]);
  });

  it('devuelve una lista vacía cuando el Scan no trae Items (defensivo)', async () => {
    const client = fakeClient(async () => ({}));

    await expect(listResources(client)).resolves.toEqual([]);
  });

  it('conserva un recurso en MAINTENANCE tal cual está en la base, sin filtrarlo', async () => {
    const client = fakeClient(async () => ({ Items: [piscina1] }));

    const result = await listResources(client);

    expect(result).toEqual([piscina1]);
  });
});
