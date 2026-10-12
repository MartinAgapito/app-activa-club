import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateResourceMock = vi.fn();
vi.mock('../../resources/update', () => ({ updateResource: updateResourceMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./update');

function buildEvent(options: {
  resourceId?: string | null;
  body?: unknown;
  rawBody?: string | null;
  claims?: Record<string, string>;
}) {
  const resourceId = options.resourceId === undefined ? 'futbol-1' : options.resourceId;
  return buildCognitoProxyEvent({
    httpMethod: 'PATCH',
    path: `/resources/${resourceId ?? ''}`,
    pathParameters: resourceId ? { resourceId } : null,
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : JSON.stringify(options.body === undefined ? { capacity: 10 } : options.body),
    claims: options.claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('PATCH /resources/{resourceId}', () => {
  beforeEach(() => {
    updateResourceMock.mockReset();
  });

  it('criterio 9: un member recibe 403 FORBIDDEN sin invocar al orquestador', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'member-sub', 'cognito:groups': '[member]' } }),
    );

    expect(result.statusCode).toBe(403);
    expect(updateResourceMock).not.toHaveBeenCalled();
  });

  it('criterio 2: cuerpo vacío devuelve 400', async () => {
    const result = await handler(buildEvent({ body: {} }));

    expect(result.statusCode).toBe(400);
    expect(updateResourceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['aforo no positivo', { capacity: 0 }],
    ['aforo no entero', { capacity: 2.5 }],
    ['hora con formato incorrecto', { opensAt: '6:00' }],
    ['hora fuera de rango', { closesAt: '25:61' }],
    ['estado desconocido', { resourceStatus: 'CLOSED' }],
  ])('criterio 2: %s devuelve 400', async (_label, body) => {
    const result = await handler(buildEvent({ body }));

    expect(result.statusCode).toBe(400);
    expect(updateResourceMock).not.toHaveBeenCalled();
  });

  it.each(['blockMinutes', 'type', 'name', 'requiresApproval'])(
    'criterio 7: el campo no editable %s se rechaza con 400',
    async (field) => {
      const result = await handler(buildEvent({ body: { capacity: 10, [field]: 30 } }));

      expect(result.statusCode).toBe(400);
      expect(updateResourceMock).not.toHaveBeenCalled();
    },
  );

  it('devuelve 400 si el cuerpo no es JSON válido', async () => {
    const result = await handler(buildEvent({ rawBody: '{no-json' }));

    expect(result.statusCode).toBe(400);
  });

  it('devuelve 400 si falta el path parameter (defensivo)', async () => {
    const result = await handler(buildEvent({ resourceId: null }));

    expect(result.statusCode).toBe(400);
  });

  it('criterio 1: admin actualiza y responde 200 con el recurso; el actor sale del sub', async () => {
    const resource = {
      resourceId: 'futbol-1',
      type: 'FUTBOL',
      name: 'Cancha de fútbol 1',
      capacity: 10,
      blockMinutes: 90,
      opensAt: '06:00',
      closesAt: '22:00',
      requiresApproval: false,
      resourceStatus: 'AVAILABLE',
    };
    updateResourceMock.mockResolvedValue(resource);

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(resource);
    expect(updateResourceMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      changes: { capacity: 10 },
      actor: { actorId: 'admin-sub', actorRole: 'admin' },
      requestId: expect.any(String),
    });
  });

  it('criterio 3: propaga 404 NOT_FOUND del orquestador', async () => {
    updateResourceMock.mockRejectedValue(new AppError('NOT_FOUND', 'No existe.'));

    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(404);
  });

  it('criterio 2: propaga 400 VALIDATION_ERROR del orquestador (closesAt <= opensAt)', async () => {
    updateResourceMock.mockRejectedValue(new AppError('VALIDATION_ERROR', 'closesAt inválido.'));

    const result = await handler(buildEvent({ body: { opensAt: '23:00' } }));

    expect(result.statusCode).toBe(400);
  });
});
