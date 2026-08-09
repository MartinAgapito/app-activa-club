// US-022 — integración con Culqi.js.
// Cubre: tokenización exitosa, error de Culqi (tarjeta rechazada por el
// widget), falta de llave pública, y el caso alternativo "Culqi.js no
// carga" (bloqueado o sin red).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CulqiError, requestCulqiToken, type CulqiGlobal } from './culqi';

function createCulqiMock(): CulqiGlobal {
  return {
    publicKey: '',
    settings: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    token: null,
    error: null,
  };
}

describe('requestCulqiToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.Culqi;
    delete window.culqi;
  });

  it('rechaza de inmediato si no hay llave pública configurada, sin abrir el widget', async () => {
    const culqi = createCulqiMock();
    window.Culqi = culqi;

    await expect(
      requestCulqiToken({
        publicKey: '',
        amount: 12000,
        currency: 'PEN',
        title: 'Activa Club',
        description: 'Membresía Mensual',
      }),
    ).rejects.toThrow(CulqiError);

    expect(culqi.open).not.toHaveBeenCalled();
  });

  it('resuelve con el token cuando Culqi.js confirma la tokenización', async () => {
    const culqi = createCulqiMock();
    window.Culqi = culqi;
    vi.mocked(culqi.open).mockImplementation(() => {
      culqi.token = { id: 'tkn_test_123' };
      window.culqi?.();
    });

    const token = await requestCulqiToken({
      publicKey: 'pk_test_abc',
      amount: 12000,
      currency: 'PEN',
      title: 'Activa Club',
      description: 'Membresía Mensual',
    });

    expect(token).toBe('tkn_test_123');
    expect(culqi.publicKey).toBe('pk_test_abc');
    expect(culqi.settings).toHaveBeenCalledWith({
      title: 'Activa Club',
      currency: 'PEN',
      amount: 12000,
      description: 'Membresía Mensual',
    });
  });

  it('rechaza con un mensaje seguro cuando Culqi.js devuelve un error de tokenización', async () => {
    const culqi = createCulqiMock();
    window.Culqi = culqi;
    vi.mocked(culqi.open).mockImplementation(() => {
      culqi.token = null;
      culqi.error = { user_message: 'La tarjeta no es válida.' };
      window.culqi?.();
    });

    await expect(
      requestCulqiToken({
        publicKey: 'pk_test_abc',
        amount: 12000,
        currency: 'PEN',
        title: 'Activa Club',
        description: 'Membresía Mensual',
      }),
    ).rejects.toThrow('La tarjeta no es válida.');
  });

  it('caso alternativo: rechaza con un error explícito si Culqi.js no carga', async () => {
    const originalCreateElement = document.createElement.bind(document);
    const scriptElements: HTMLScriptElement[] = [];
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const element = originalCreateElement(tag);
      if (tag === 'script') scriptElements.push(element as HTMLScriptElement);
      return element;
    });
    vi.spyOn(document.head, 'appendChild').mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) {
        queueMicrotask(() => node.onerror?.(new Event('error')));
      }
      return node;
    });

    await expect(
      requestCulqiToken({
        publicKey: 'pk_test_abc',
        amount: 12000,
        currency: 'PEN',
        title: 'Activa Club',
        description: 'Membresía Mensual',
      }),
    ).rejects.toThrow(
      'No pudimos cargar la pasarela de pago. Verifica tu conexión e intenta nuevamente.',
    );
  });
});

describe('CulqiGlobal token/error nunca contienen datos de tarjeta', () => {
  beforeEach(() => {
    delete window.Culqi;
    delete window.culqi;
  });

  afterEach(() => {
    delete window.Culqi;
    delete window.culqi;
  });

  it('el resultado de la tokenización expone solo un id opaco, sin PAN/CVV', async () => {
    const culqi = createCulqiMock();
    window.Culqi = culqi;
    vi.mocked(culqi.open).mockImplementation(() => {
      culqi.token = { id: 'tkn_test_456' };
      window.culqi?.();
    });

    const token = await requestCulqiToken({
      publicKey: 'pk_test_abc',
      amount: 12000,
      currency: 'PEN',
      title: 'Activa Club',
      description: 'Membresía Mensual',
    });

    expect(token).not.toMatch(/\d{12,}/); // ningún PAN de tarjeta en el token
    expect(Object.keys(culqi.token ?? {})).toEqual(['id']);
  });
});
