import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const warnMock = vi.fn();
vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: warnMock, error: vi.fn() },
}));

const { resolveMemberNames, withMemberNames } = await import('./member-names');

type GetInput = { Key: { PK: string; SK: string }; ProjectionExpression?: string };

function fakeClient(send: (input: GetInput) => Promise<unknown>) {
  const spy = vi.fn(async (command: unknown) => send((command as { input: GetInput }).input));
  return {
    client: { send: spy } as unknown as DynamoDBDocumentClient,
    spy,
  };
}

const options = { requestId: 'req-1' };

describe('resolveMemberNames', () => {
  beforeEach(() => {
    warnMock.mockReset();
  });

  it('lee una sola vez cada memberId repetido y proyecta solo el nombre (criterio 3/4)', async () => {
    const { client, spy } = fakeClient(async (input) => ({
      Item: {
        memberId: input.Key.PK.replace('MEMBER#', ''),
        firstName: 'María',
        lastName: 'Quispe',
      },
    }));

    const names = await resolveMemberNames(client, ['m-1', 'm-2', 'm-1', 'm-1'], options);

    expect(spy).toHaveBeenCalledTimes(2);
    const inputs = spy.mock.calls.map((call) => (call[0] as { input: GetInput }).input);
    expect(inputs[0]?.Key).toEqual({ PK: 'MEMBER#m-1', SK: 'PROFILE' });
    expect(inputs[0]?.ProjectionExpression).toBe('memberId, firstName, lastName');
    expect(names.get('m-1')).toEqual({ memberId: 'm-1', firstName: 'María', lastName: 'Quispe' });
    expect(names.get('m-2')).toEqual({ memberId: 'm-2', firstName: 'María', lastName: 'Quispe' });
  });

  it('un socio inexistente da null sin error', async () => {
    const { client } = fakeClient(async () => ({}));

    const names = await resolveMemberNames(client, ['m-borrado'], options);

    expect(names.get('m-borrado')).toBeNull();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it('un AccessDenied degrada a null, registra WARN sin datos sensibles y no lanza', async () => {
    const { client } = fakeClient(async () => {
      const error = new Error('User is not authorized to perform: dynamodb:GetItem');
      error.name = 'AccessDeniedException';
      throw error;
    });

    const names = await resolveMemberNames(client, ['m-1', 'm-2'], options);

    expect(names.get('m-1')).toBeNull();
    expect(names.get('m-2')).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(2);
    const fields = warnMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(fields).toMatchObject({
      requestId: 'req-1',
      errorName: 'AccessDeniedException',
      memberId: 'm-1',
    });
    expect(JSON.stringify(fields)).not.toContain('not authorized');
  });

  it('una falla aislada no afecta a los demás socios', async () => {
    const { client } = fakeClient(async (input) => {
      if (input.Key.PK === 'MEMBER#m-malo') throw new Error('boom');
      return { Item: { memberId: 'm-ok', firstName: 'Ana', lastName: 'Rojas' } };
    });

    const names = await resolveMemberNames(client, ['m-malo', 'm-ok'], options);

    expect(names.get('m-malo')).toBeNull();
    expect(names.get('m-ok')).toEqual({ memberId: 'm-ok', firstName: 'Ana', lastName: 'Rojas' });
  });
});

describe('withMemberNames', () => {
  it('agrega member a cada pago sin alterar el resto de los campos', async () => {
    const { client, spy } = fakeClient(async () => ({
      Item: { memberId: 'm-1', firstName: 'María', lastName: 'Quispe' },
    }));

    const result = await withMemberNames(
      client,
      [
        { paymentId: 'p-1', memberId: 'm-1' },
        { paymentId: 'p-2', memberId: 'm-1' },
        { paymentId: 'p-3', memberId: 'm-1' },
      ],
      options,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({
      paymentId: 'p-3',
      memberId: 'm-1',
      member: { memberId: 'm-1', firstName: 'María', lastName: 'Quispe' },
    });
  });
});
