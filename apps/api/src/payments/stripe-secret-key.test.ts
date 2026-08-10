import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSMClient } from '@aws-sdk/client-ssm';

const { getStripeSecretKey, resetStripeSecretKeyCacheForTests } =
  await import('./stripe-secret-key');

function fakeSsmClient(value: string | undefined): SSMClient & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn(async () => ({ Parameter: value === undefined ? undefined : { Value: value } })),
  } as unknown as SSMClient & { send: ReturnType<typeof vi.fn> };
}

describe('getStripeSecretKey', () => {
  const originalEnv = process.env['STRIPE_SECRET_KEY_PARAM_NAME'];

  beforeEach(() => {
    resetStripeSecretKeyCacheForTests();
    process.env['STRIPE_SECRET_KEY_PARAM_NAME'] = '/activa-club/dev/stripe/secret-key';
  });

  afterEach(() => {
    resetStripeSecretKeyCacheForTests();
    if (originalEnv === undefined) {
      delete process.env['STRIPE_SECRET_KEY_PARAM_NAME'];
    } else {
      process.env['STRIPE_SECRET_KEY_PARAM_NAME'] = originalEnv;
    }
  });

  it('lee la llave secreta de SSM con WithDecryption y la devuelve', async () => {
    const client = fakeSsmClient('sk_test_shhh');

    const secretKey = await getStripeSecretKey(client);

    expect(secretKey).toBe('sk_test_shhh');
    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as {
      input: { Name: string; WithDecryption: boolean };
    };
    expect(command.input.Name).toBe('/activa-club/dev/stripe/secret-key');
    expect(command.input.WithDecryption).toBe(true);
  });

  it('cachea la llave: una segunda llamada no vuelve a golpear SSM', async () => {
    const client = fakeSsmClient('sk_test_shhh');

    await getStripeSecretKey(client);
    await getStripeSecretKey(client);

    expect(client.send).toHaveBeenCalledTimes(1);
  });

  it('lanza si SSM no devuelve ningún valor (parámetro sin cargar)', async () => {
    const client = fakeSsmClient(undefined);

    await expect(getStripeSecretKey(client)).rejects.toThrow();
  });
});
