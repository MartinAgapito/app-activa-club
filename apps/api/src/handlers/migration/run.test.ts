import { beforeEach, describe, expect, it, vi } from 'vitest';

const s3Send = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class FakeS3Client {
    send = s3Send;
  }
  class FakeGetObjectCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { S3Client: FakeS3Client, GetObjectCommand: FakeGetObjectCommand };
});

const runMigrationMock = vi.fn();
vi.mock('../../migration/run', () => ({ runMigration: runMigrationMock }));
vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handler } = await import('./run');

const summary = {
  total: 2,
  migrated: 1,
  skipped: 1,
  rejected: 0,
  rejectedItems: [],
  runAt: '2026-07-09T00:00:00Z',
};

describe('Lambda migration-run (invocación directa, ADR-0012)', () => {
  beforeEach(() => {
    s3Send.mockReset();
    runMigrationMock.mockReset();
    process.env['MIGRATION_BUCKET_NAME'] = 'activa-club-test-migration';
  });

  it('con evento vacío lee legacy-export.json y devuelve el resumen de runMigration', async () => {
    s3Send.mockResolvedValue({
      Body: {
        transformToString: async () =>
          JSON.stringify({ version: '1', exportedAt: '2026-07-01T00:00:00Z', socios: [] }),
      },
    });
    runMigrationMock.mockImplementation(async (input: { readSource: () => Promise<unknown> }) => {
      await input.readSource();
      return summary;
    });

    const result = await handler({});

    expect(result).toEqual(summary);
    const command = s3Send.mock.calls[0]?.[0] as { input: { Bucket: string; Key: string } };
    expect(command.input).toEqual({
      Bucket: 'activa-club-test-migration',
      Key: 'legacy-export.json',
    });
  });

  it('audita con actor migration-operator / system e ignora el contenido del evento', async () => {
    runMigrationMock.mockResolvedValue(summary);

    await handler({ cualquier: 'cosa', actorId: 'intruso' });

    const callArg = runMigrationMock.mock.calls[0]?.[0] as { actor: unknown };
    expect(callArg.actor).toEqual({ actorId: 'migration-operator', actorRole: 'system' });
  });

  it('lanza VALIDATION_ERROR cuando S3 devuelve un JSON inválido (la invocación falla)', async () => {
    runMigrationMock.mockImplementation(async (input: { readSource: () => Promise<unknown> }) => {
      await input.readSource();
      throw new Error('runMigration no debería continuar tras un readSource fallido');
    });
    s3Send.mockResolvedValue({ Body: { transformToString: async () => 'no-es-json' } });

    await expect(handler({})).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('propaga el error cuando el objeto no existe en S3', async () => {
    runMigrationMock.mockImplementation(async (input: { readSource: () => Promise<unknown> }) =>
      input.readSource(),
    );
    const noSuchKey = Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
    s3Send.mockRejectedValue(noSuchKey);

    await expect(handler({})).rejects.toThrow('NoSuchKey');
  });
});
