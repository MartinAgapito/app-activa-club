import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { verifyActivation } = await import('./verify');

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

function pkOf(command: unknown): string {
  return (command as { input: { ExpressionAttributeValues: Record<string, string> } }).input
    .ExpressionAttributeValues[':pk'] as string;
}

describe('verifyActivation', () => {
  it('devuelve elegibilidad y datos mínimos para un socio migrado sin cuenta (criterio 1)', async () => {
    const client = fakeClient(async (command) => {
      if (pkOf(command) === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      return {
        Items: [
          {
            memberId: 'member-1',
            firstName: 'María',
            email: 'maria.quispe@example.com',
            memberStatus: 'MIGRATED',
            cognitoSub: null,
          },
        ],
      };
    });

    const result = await verifyActivation({ request: { dni: '45678912' }, client });

    expect(result).toEqual({
      eligible: true,
      memberId: 'member-1',
      firstName: 'María',
      maskedEmail: 'm***@example.com',
    });
  });

  it('devuelve DNI_NOT_FOUND (404) si no existe un socio migrado con ese DNI (criterio 2)', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(verifyActivation({ request: { dni: '00000000' }, client })).rejects.toMatchObject({
      code: 'DNI_NOT_FOUND',
    });
  });

  it('devuelve ALREADY_ACTIVATED (409) si el socio ya tiene cognitoSub enlazado (criterio 3)', async () => {
    const client = fakeClient(async (command) => {
      if (pkOf(command) === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      return {
        Items: [
          {
            memberId: 'member-1',
            firstName: 'María',
            email: 'maria.quispe@example.com',
            memberStatus: 'ACTIVE',
            cognitoSub: 'cognito-sub-1',
          },
        ],
      };
    });

    await expect(verifyActivation({ request: { dni: '45678912' }, client })).rejects.toMatchObject({
      code: 'ALREADY_ACTIVATED',
    });
  });

  it('devuelve INTERNAL_ERROR si el UniqueDni no tiene Member asociado (defensivo)', async () => {
    const client = fakeClient(async (command) => {
      if (pkOf(command) === 'UNIQ#DNI#45678912') return { Items: [{ memberId: 'member-1' }] };
      return { Items: [] };
    });

    await expect(verifyActivation({ request: { dni: '45678912' }, client })).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
  });
});
