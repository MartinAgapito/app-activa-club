import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { runMigration } = await import('./run');
const { sampleLegacyExportWithInvalidItem } = await import('./fixtures/legacy-export.sample');

function fakeClient(
  sendImpl: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(sendImpl) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('runMigration', () => {
  it('migra los socios válidos, rechaza el inválido y audita el resumen (mapeo-migracion.md §4/§6)', async () => {
    const client = fakeClient(async () => ({}));

    const result = await runMigration({
      readSource: async () => sampleLegacyExportWithInvalidItem,
      actor: { actorId: 'admin-1', actorRole: 'admin' },
      client,
      now: new Date('2026-07-09T12:00:00Z'),
    });

    expect(result.total).toBe(5);
    expect(result.migrated).toBe(4);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.rejectedItems).toEqual([{ index: 4, reason: 'MISSING_EMAIL' }]);
    expect(result.runAt).toBe('2026-07-09T12:00:00.000Z');
    // 4 TransactWriteCommand (uno por socio válido) + 1 PutCommand de auditoría.
    expect(client.send).toHaveBeenCalledTimes(5);
  });

  it('marca como omitido (no rechazado) un socio ya migrado previamente (idempotencia RT-10)', async () => {
    let call = 0;
    const client = fakeClient(async (command) => {
      call += 1;
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'TransactWriteCommand' && call === 1) {
        throw Object.assign(new Error('cancelled'), { name: 'TransactionCanceledException' });
      }
      return {};
    });

    const result = await runMigration({
      readSource: async () => ({
        version: '1',
        exportedAt: '2026-07-01T00:00:00Z',
        socios: [sampleLegacyExportWithInvalidItem.socios[0]],
      }),
      actor: { actorId: 'admin-1', actorRole: 'admin' },
      client,
      now: new Date('2026-07-09T12:00:00Z'),
    });

    expect(result.migrated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('omite (no duplica) un segundo socio con el mismo DNI dentro del mismo lote (caso alternativo de US-012)', async () => {
    let transactWriteCalls = 0;
    const client = fakeClient(async (command) => {
      const ctorName = (command as { constructor: { name: string } }).constructor.name;
      if (ctorName === 'TransactWriteCommand') {
        transactWriteCalls += 1;
        // El primer socio del lote escribe sin problema; el segundo, con el
        // mismo DNI, choca contra la condición de unicidad UNIQ#DNI ya
        // escrita por el primero (simulado aquí porque el cliente fake no
        // mantiene estado real de DynamoDB entre invocaciones).
        if (transactWriteCalls === 2) {
          throw Object.assign(new Error('cancelled'), {
            name: 'TransactionCanceledException',
          });
        }
      }
      return {};
    });

    const [primerSocio] = sampleLegacyExportWithInvalidItem.socios;
    if (!primerSocio) throw new Error('fixture inválido');

    const socioDuplicado = {
      ...primerSocio,
      legacyId: 'SOC-TEST-001-DUPLICADO',
      email: 'otro.correo.fixture@example.com',
    };

    const result = await runMigration({
      readSource: async () => ({
        version: '1',
        exportedAt: '2026-07-01T00:00:00Z',
        socios: [primerSocio, socioDuplicado],
      }),
      actor: { actorId: 'admin-1', actorRole: 'admin' },
      client,
      now: new Date('2026-07-09T12:00:00Z'),
    });

    expect(result.total).toBe(2);
    expect(result.migrated).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.rejected).toBe(0);
  });

  it('rechaza con VALIDATION_ERROR si la envoltura del JSON no es válida', async () => {
    const client = fakeClient(async () => ({}));

    await expect(
      runMigration({
        readSource: async () => ({ foo: 'bar' }),
        actor: { actorId: 'admin-1', actorRole: 'admin' },
        client,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(client.send).not.toHaveBeenCalled();
  });
});
