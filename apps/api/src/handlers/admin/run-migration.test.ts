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

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./run-migration');

describe('POST /admin/migration/run', () => {
  beforeEach(() => {
    s3Send.mockReset();
    runMigrationMock.mockReset();
    process.env['MIGRATION_BUCKET_NAME'] = 'activa-club-test-migration';
  });

  it('devuelve 403 si el rol autenticado no es admin', async () => {
    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/admin/migration/run',
      claims: { sub: 'admin-sub', 'cognito:groups': '[member]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(403);
    expect(runMigrationMock).not.toHaveBeenCalled();
    expect(s3Send).not.toHaveBeenCalled();
  });

  it('lee el JSON de S3 y delega en runMigration para un admin autenticado', async () => {
    s3Send.mockResolvedValue({
      Body: {
        transformToString: async () =>
          JSON.stringify({ version: '1', exportedAt: '2026-07-01T00:00:00Z', socios: [] }),
      },
    });
    runMigrationMock.mockResolvedValue({
      total: 0,
      migrated: 0,
      skipped: 0,
      rejected: 0,
      rejectedItems: [],
      runAt: '2026-07-09T00:00:00Z',
    });

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/admin/migration/run',
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(202);
    expect(runMigrationMock).toHaveBeenCalledTimes(1);
    const callArg = runMigrationMock.mock.calls[0]?.[0] as { actor: unknown };
    expect(callArg.actor).toEqual({ actorId: 'admin-sub', actorRole: 'admin' });
  });

  it('propaga VALIDATION_ERROR (400) cuando readSource (S3) no devuelve JSON válido', async () => {
    // `runMigration` está mockeado a nivel de módulo (arriba); aquí se hace que
    // invoque el `readSource` real que le pasa el handler, para comprobar que
    // el wiring handler -> readLegacyExportFromS3 -> runMigration propaga el
    // error de parseo tal como lo haría la implementación real (ver
    // src/migration/run.test.ts para la orquestación completa sin mocks).
    runMigrationMock.mockImplementation(async (input: { readSource: () => Promise<unknown> }) => {
      await input.readSource();
      throw new Error('runMigration no debería continuar tras un readSource fallido');
    });
    s3Send.mockResolvedValue({ Body: { transformToString: async () => 'no-es-json' } });

    const event = buildCognitoProxyEvent({
      httpMethod: 'POST',
      path: '/admin/migration/run',
      claims: { sub: 'admin-sub', 'cognito:groups': '[admin]' },
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body) as { error: { code: string } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
