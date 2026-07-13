import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { writeMigratedMember } = await import('./repository');
const { transformLegacyMember } = await import('./transform');
const { sampleLegacyExport } = await import('./fixtures/legacy-export.sample');

const [activo] = sampleLegacyExport.socios;
if (!activo) throw new Error('fixture inválido');

const items = transformLegacyMember(activo, {
  todayLima: '2026-07-09',
  memberId: 'member-1',
  membershipId: 'membership-1',
  now: '2026-07-09T00:00:00Z',
});

function fakeClient(send: (command: unknown) => Promise<unknown>): DynamoDBDocumentClient {
  return { send } as unknown as DynamoDBDocumentClient;
}

describe('writeMigratedMember', () => {
  it('escribe una única TransactWriteCommand con condición de unicidad sobre DNI/email', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await writeMigratedMember(fakeClient(send), items);

    expect(outcome).toBe('MIGRATED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: { TransactItems: { Put: { ConditionExpression?: string } }[] };
    };
    expect(command.input.TransactItems).toHaveLength(4);
    expect(command.input.TransactItems[0]?.Put.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
    expect(command.input.TransactItems[1]?.Put.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
  });

  it('devuelve SKIPPED_ALREADY_MIGRATED si la condición de unicidad falla (RT-10)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    const outcome = await writeMigratedMember(fakeClient(send), items);

    expect(outcome).toBe('SKIPPED_ALREADY_MIGRATED');
  });

  it('propaga errores no relacionados con la condición de unicidad', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(writeMigratedMember(fakeClient(send), items)).rejects.toThrow('network error');
  });
});
