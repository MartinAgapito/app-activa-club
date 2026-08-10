// US-037 — integración con Stripe.js/Elements (reemplaza a US-022/culqi.test.ts).
// Cubre: rechazo inmediato sin llave publicable, creación exitosa del
// método de pago, error de tarjeta con mensaje seguro, y el caso
// alternativo "Stripe.js no carga" (bloqueado o sin red).

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Stripe, StripeCardElement } from '@stripe/stripe-js';

const { loadStripeMock } = vi.hoisted(() => ({ loadStripeMock: vi.fn() }));

vi.mock('@stripe/stripe-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stripe/stripe-js')>();
  return { ...actual, loadStripe: loadStripeMock };
});

import {
  createStripePaymentMethod,
  loadStripeClient,
  resetStripeClientCacheForTests,
  StripePaymentError,
} from './stripe';

function createStripeMock(): Stripe {
  return {
    createPaymentMethod: vi.fn(),
  } as unknown as Stripe;
}

describe('loadStripeClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    loadStripeMock.mockReset();
    resetStripeClientCacheForTests();
  });

  it('rechaza de inmediato si no hay llave publicable configurada, sin intentar cargar el script', async () => {
    await expect(loadStripeClient(undefined)).rejects.toThrow(StripePaymentError);
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it('resuelve con el cliente de Stripe cuando el script carga correctamente', async () => {
    const stripe = createStripeMock();
    loadStripeMock.mockResolvedValueOnce(stripe);

    const client = await loadStripeClient('pk_test_abc');

    expect(client).toBe(stripe);
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_abc');
  });

  it('cachea la promesa entre invocaciones: no vuelve a llamar a loadStripe con la misma llave', async () => {
    const stripe = createStripeMock();
    loadStripeMock.mockResolvedValueOnce(stripe);

    await loadStripeClient('pk_test_abc');
    await loadStripeClient('pk_test_abc');

    expect(loadStripeMock).toHaveBeenCalledTimes(1);
  });

  it('caso alternativo: rechaza con un error explícito si Stripe.js no carga (bloqueado o sin red)', async () => {
    loadStripeMock.mockResolvedValueOnce(null);

    await expect(loadStripeClient('pk_test_abc')).rejects.toThrow(
      'No pudimos cargar la pasarela de pago. Verifica tu conexión e intenta nuevamente.',
    );
  });

  it('invalida la caché tras un fallo, permitiendo reintentar', async () => {
    loadStripeMock.mockResolvedValueOnce(null);
    await expect(loadStripeClient('pk_test_abc')).rejects.toThrow(StripePaymentError);

    const stripe = createStripeMock();
    loadStripeMock.mockResolvedValueOnce(stripe);
    const client = await loadStripeClient('pk_test_abc');

    expect(client).toBe(stripe);
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });
});

describe('createStripePaymentMethod', () => {
  it('resuelve con el id opaco del método de pago cuando Stripe confirma la creación', async () => {
    const stripe = createStripeMock();
    const cardElement = {} as StripeCardElement;
    vi.mocked(stripe.createPaymentMethod).mockResolvedValueOnce({
      paymentMethod: { id: 'pm_test_123' },
    } as Awaited<ReturnType<Stripe['createPaymentMethod']>>);

    const paymentMethodId = await createStripePaymentMethod({ stripe, cardElement });

    expect(paymentMethodId).toBe('pm_test_123');
    expect(stripe.createPaymentMethod).toHaveBeenCalledWith({ type: 'card', card: cardElement });
  });

  it('rechaza con un mensaje seguro cuando Stripe devuelve un error de tarjeta', async () => {
    const stripe = createStripeMock();
    const cardElement = {} as StripeCardElement;
    vi.mocked(stripe.createPaymentMethod).mockResolvedValueOnce({
      error: { type: 'card_error', message: 'La tarjeta no es válida.' },
    } as Awaited<ReturnType<Stripe['createPaymentMethod']>>);

    await expect(createStripePaymentMethod({ stripe, cardElement })).rejects.toThrow(
      'La tarjeta no es válida.',
    );
  });

  it('el resultado expone solo un id opaco, sin PAN/CVC', async () => {
    const stripe = createStripeMock();
    const cardElement = {} as StripeCardElement;
    vi.mocked(stripe.createPaymentMethod).mockResolvedValueOnce({
      paymentMethod: { id: 'pm_test_456' },
    } as Awaited<ReturnType<Stripe['createPaymentMethod']>>);

    const paymentMethodId = await createStripePaymentMethod({ stripe, cardElement });

    expect(paymentMethodId).not.toMatch(/\d{12,}/); // ningún PAN de tarjeta en el id
  });
});
