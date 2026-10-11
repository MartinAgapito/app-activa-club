// Cliente de bloqueos: usa el `apiRequest` real con `fetch` simulado para
// comprobar que el 204 sin cuerpo no rompe al cliente.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../lib/api/http-client';
import {
  createMaintenanceBlock,
  listMaintenanceBlocks,
  releaseMaintenanceBlock,
} from './admin-maintenance-client';

function stubFetch(response: Response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('admin-maintenance-client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('liberar tolera un 204 sin cuerpo', async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await expect(releaseMaintenanceBlock('piscina-1', 'blk 1')).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/resources/piscina-1/maintenance/blk%201');
    expect(init.method).toBe('DELETE');
  });

  it('liberar propaga el 404 NOT_FOUND', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'x', requestId: 'r' } }), {
        status: 404,
      }),
    );

    await expect(releaseMaintenanceBlock('piscina-1', 'blk-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(releaseMaintenanceBlock('piscina-1', 'blk-1')).rejects.toBeInstanceOf(
      ApiRequestError,
    );
  });

  it('crea un bloqueo con POST y cuerpo JSON', async () => {
    const created = {
      blockId: 'b',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: null,
      affectedReservationCount: 1,
    };
    const fetchMock = stubFetch(new Response(JSON.stringify(created), { status: 201 }));

    await expect(
      createMaintenanceBlock('piscina-1', {
        startsAt: created.startsAt,
        endsAt: created.endsAt,
      }),
    ).resolves.toEqual(created);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/resources/piscina-1/maintenance');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      startsAt: created.startsAt,
      endsAt: created.endsAt,
    });
  });

  it('lista los bloqueos del recurso', async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await expect(listMaintenanceBlocks('piscina-1')).resolves.toEqual({ items: [] });
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/resources/piscina-1/maintenance');
  });
});
