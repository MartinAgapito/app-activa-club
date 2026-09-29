import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { lookupGuestByDni } = await import('./lookup');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

function keyOf(command: unknown): Record<string, string> {
  return (command as { input: { Key: Record<string, string> } }).input.Key;
}

describe('lookupGuestByDni', () => {
  it('devuelve exactamente guestDni/firstName/lastName de un invitado ya registrado (criterio 15)', async () => {
    const client = fakeClient(async (command) => {
      expect((command as { constructor: { name: string } }).constructor.name).toBe('GetCommand');
      expect(keyOf(command)).toEqual({ PK: 'GUEST#70605040', SK: 'PROFILE' });
      return {
        Item: {
          guestDni: '70605040',
          firstName: 'Ana',
          lastName: 'Torres',
          createdByMemberId: 'member-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      };
    });

    const result = await lookupGuestByDni({ dni: '70605040', client });

    expect(result).toEqual({ guestDni: '70605040', firstName: 'Ana', lastName: 'Torres' });
    expect(Object.keys(result)).toEqual(['guestDni', 'firstName', 'lastName']);
  });

  it('devuelve NOT_FOUND (404) si el DNI nunca fue invitado (no es error de negocio)', async () => {
    const client = fakeClient(async () => ({}));

    await expect(lookupGuestByDni({ dni: '00000000', client })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
