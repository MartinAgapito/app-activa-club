import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSMClient } from '@aws-sdk/client-ssm';

const { getCulqiWebhookSecret, resetCulqiWebhookSecretCacheForTests } =
  await import('./webhook-secret');

function fakeSsmClient(value: string | undefined): SSMClient & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(async () => ({ Parameter: value === undefined ? undefined : { Value: value } })),
  } as unknown as SSMClient & { send: ReturnType<typeof vi.fn> };
}

describe('getCulqiWebhookSecret', () => {
  const originalEnv = process.env['CULQI_WEBHOOK_SECRET_PARAM_NAME'];

  beforeEach(() => {
    resetCulqiWebhookSecretCacheForTests();
    process.env['CULQI_WEBHOOK_SECRET_PARAM_NAME'] = '/activa-club/dev/culqi/webhook-secret';
  });

  afterEach(() => {
    resetCulqiWebhookSecretCacheForTests();
    if (originalEnv === undefined) {
      delete process.env['CULQI_WEBHOOK_SECRET_PARAM_NAME'];
    } else {
      process.env['CULQI_WEBHOOK_SECRET_PARAM_NAME'] = originalEnv;
    }
  });

  it('lee el secreto de SSM con WithDecryption y lo devuelve', async () => {
    const client = fakeSsmClient('shhh-secret');

    const secret = await getCulqiWebhookSecret(client);

    expect(secret).toBe('shhh-secret');
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as {
      input: { Name: string; WithDecryption: boolean };
    };
    expect(command.input.Name).toBe('/activa-club/dev/culqi/webhook-secret');
    expect(command.input.WithDecryption).toBe(true);
  });

  it('cachea el secreto: una segunda llamada no vuelve a golpear SSM', async () => {
    const client = fakeSsmClient('shhh-secret');

    await getCulqiWebhookSecret(client);
    await getCulqiWebhookSecret(client);

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('lanza si SSM no devuelve ningún valor (parámetro sin cargar)', async () => {
    const client = fakeSsmClient(undefined);

    await expect(getCulqiWebhookSecret(client)).rejects.toThrow();
  });
});
