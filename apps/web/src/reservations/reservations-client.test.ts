// Cliente de reservas (US-032): 404 de `guests/lookup` es "invitado nuevo",
// no un error; el resto de fallos sí se propagan.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../lib/api/http-client';
import { createReservation, lookupGuestByDni, lookupMemberByDni } from './reservations-client';

function mockFetchOnce(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('reservations-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lookupGuestByDni devuelve el invitado registrado', async () => {
    const fetchMock = mockFetchOnce(200, {
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });

    await expect(lookupGuestByDni('70605040')).resolves.toEqual({
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });
    expect(fetchMock.mock.calls[0]![0]).toContain('/guests/lookup?dni=70605040');
  });

  it('lookupGuestByDni devuelve null ante 404 NOT_FOUND (invitado nuevo)', async () => {
    mockFetchOnce(404, { error: { code: 'NOT_FOUND', message: 'No encontrado' } });

    await expect(lookupGuestByDni('70605040')).resolves.toBeNull();
  });

  it('lookupGuestByDni propaga errores que no son 404', async () => {
    mockFetchOnce(400, { error: { code: 'VALIDATION_ERROR', message: 'DNI inválido' } });

    await expect(lookupGuestByDni('123')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('lookupMemberByDni propaga 404 DNI_NOT_FOUND', async () => {
    mockFetchOnce(404, { error: { code: 'DNI_NOT_FOUND', message: 'No existe' } });

    const promise = lookupMemberByDni('45678912');
    await expect(promise).rejects.toBeInstanceOf(ApiRequestError);
    await expect(promise).rejects.toMatchObject({ code: 'DNI_NOT_FOUND', status: 404 });
  });

  it('createReservation envía POST /reservations con el cuerpo del contrato', async () => {
    const fetchMock = mockFetchOnce(201, { reservationId: 'r1' });

    await createReservation({
      resourceId: 'futbol-1',
      startsAt: '2026-08-12T11:00:00Z',
      participants: [],
    });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/reservations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      resourceId: 'futbol-1',
      startsAt: '2026-08-12T11:00:00Z',
      participants: [],
    });
  });
});
