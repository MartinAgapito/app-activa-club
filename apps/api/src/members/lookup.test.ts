import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { lookupMemberByDni } = await import('./lookup');

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

describe('lookupMemberByDni', () => {
  it('devuelve exactamente memberId/firstName/lastName de un socio ACTIVE (criterio 14)', async () => {
    const client = fakeClient(async (command) => {
      const key = keyOf(command);
      if (key['PK'] === 'UNIQ#DNI#45678912') return { Item: { memberId: 'member-1' } };
      if (key['PK'] === 'MEMBER#member-1') {
        return {
          Item: {
            memberId: 'member-1',
            firstName: 'María',
            lastName: 'Quispe',
            email: 'maria@example.com',
            dni: '45678912',
            memberStatus: 'ACTIVE',
            membershipStatus: 'ACTIVE',
            outstandingBalance: 0,
          },
        };
      }
      throw new Error('GetCommand inesperado');
    });

    const result = await lookupMemberByDni({ dni: '45678912', client });

    expect(result).toEqual({ memberId: 'member-1', firstName: 'María', lastName: 'Quispe' });
    expect(Object.keys(result)).toEqual(['memberId', 'firstName', 'lastName']);
  });

  it.each(['MIGRATED', 'APPROVED'])(
    'resuelve un socio %s (además de ACTIVE)',
    async (memberStatus) => {
      const client = fakeClient(async (command) => {
        const key = keyOf(command);
        if (key['PK'] === 'UNIQ#DNI#45678912') return { Item: { memberId: 'member-1' } };
        return {
          Item: { memberId: 'member-1', firstName: 'María', lastName: 'Quispe', memberStatus },
        };
      });

      await expect(lookupMemberByDni({ dni: '45678912', client })).resolves.toMatchObject({
        memberId: 'member-1',
      });
    },
  );

  it('devuelve DNI_NOT_FOUND (404) si no existe ningún socio con ese DNI', async () => {
    const client = fakeClient(async () => ({}));

    await expect(lookupMemberByDni({ dni: '00000000', client })).rejects.toMatchObject({
      code: 'DNI_NOT_FOUND',
    });
  });

  it.each(['PENDING', 'REJECTED'])(
    'devuelve DNI_NOT_FOUND (404) si el socio existe pero está %s (RN-ACT-06/07)',
    async (memberStatus) => {
      const client = fakeClient(async (command) => {
        const key = keyOf(command);
        if (key['PK'] === 'UNIQ#DNI#45678912') return { Item: { memberId: 'member-1' } };
        return {
          Item: { memberId: 'member-1', firstName: 'María', lastName: 'Quispe', memberStatus },
        };
      });

      await expect(lookupMemberByDni({ dni: '45678912', client })).rejects.toMatchObject({
        code: 'DNI_NOT_FOUND',
      });
    },
  );

  it('devuelve DNI_NOT_FOUND (defensivo) si el UniqueDni no tiene Member asociado', async () => {
    const client = fakeClient(async (command) => {
      const key = keyOf(command);
      if (key['PK'] === 'UNIQ#DNI#45678912') return { Item: { memberId: 'member-1' } };
      return {};
    });

    await expect(lookupMemberByDni({ dni: '45678912', client })).rejects.toMatchObject({
      code: 'DNI_NOT_FOUND',
    });
  });

  it('consulta por GetItem (nunca Query/Scan), ADR-0009', async () => {
    const send = vi.fn(async (command: unknown) => {
      expect((command as { constructor: { name: string } }).constructor.name).toBe('GetCommand');
      const key = keyOf(command);
      if (key['PK'] === 'UNIQ#DNI#45678912') return { Item: { memberId: 'member-1' } };
      return {
        Item: {
          memberId: 'member-1',
          firstName: 'María',
          lastName: 'Quispe',
          memberStatus: 'ACTIVE',
        },
      };
    });

    await lookupMemberByDni({ dni: '45678912', client: fakeClient(send) });
    expect(send).toHaveBeenCalledTimes(2);
  });
});
