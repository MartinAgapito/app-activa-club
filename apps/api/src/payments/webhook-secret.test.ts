import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSMClient } from '@aws-sdk/client-ssm';

const { getStripeWebhookSecret, resetStripeWebhookSecretCacheForTests } =
  await import('./webhook-secret');

function fakeSsmClient(value: string | undefined): SSMClient & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(async () => ({ Parameter: value === undefined ? undefined : { Value: value } })),
  } as unknown as SSMClient & { send: ReturnType<typeof vi.fn> };
}

describe('getStripeWebhookSecret', () => {
  const originalEnv = process.env['STRIPE_WEBHOOK_SECRET_PARAM_NAME'];

  beforeEach(() => {
    resetStripeWebhookSecretCacheForTests();
    process.env['STRIPE_WEBHOOK_SECRET_PARAM_NAME'] =
      '/activa-club/dev/stripe/webhook-signing-secret';
  });

  afterEach(() => {
    resetStripeWebhookSecretCacheForTests();
    if (originalEnv === undefined) {
      delete process.env['STRIPE_WEBHOOK_SECRET_PARAM_NAME'];
    } else {
      process.env['STRIPE_WEBHOOK_SECRET_PARAM_NAME'] = originalEnv;
    }
  });

  it('lee el secreto de SSM con WithDecryption y lo devuelve', async () => {
    const client = fakeSsmClient('whsec_shhh');

    const secret = await getStripeWebhookSecret(client);

    expect(secret).toBe('whsec_shhh');
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as {
      input: { Name: string; WithDecryption: boolean };
    };
    expect(command.input.Name).toBe('/activa-club/dev/stripe/webhook-signing-secret');
    expect(command.input.WithDecryption).toBe(true);
  });

  it('cachea el secreto: una segunda llamada no vuelve a golpear SSM', async () => {
    const client = fakeSsmClient('whsec_shhh');

    await getStripeWebhookSecret(client);
    await getStripeWebhookSecret(client);

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('lanza si SSM no devuelve ningún valor (parámetro sin cargar)', async () => {
    const client = fakeSsmClient(undefined);

    await expect(getStripeWebhookSecret(client)).rejects.toThrow();
  });
});
