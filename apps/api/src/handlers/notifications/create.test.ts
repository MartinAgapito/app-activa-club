import { beforeEach, describe, expect, it, vi } from 'vitest';

const publishNotificationMock = vi.fn();
vi.mock('../../notifications/publish', () => ({ publishNotification: publishNotificationMock }));

const { AppError } = await import('../../lib/errors');
const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./create');

const validBody = {
  segment: 'DEBT',
  title: 'Regulariza tu membresía',
  body: 'Tienes un saldo pendiente.',
  alsoEmail: false,
};

const summary = {
  notificationId: 'N1',
  recipientCount: 3,
  emailsSent: 0,
  emailsFailed: 0,
  emailsSkipped: 0,
  replayed: false,
};

function buildEvent(options: {
  body?: unknown;
  rawBody?: string | null;
  claims?: Record<string, string>;
}) {
  return buildCognitoProxyEvent({
    httpMethod: 'POST',
    path: '/notifications',
    body:
      options.rawBody !== undefined
        ? options.rawBody
        : JSON.stringify(options.body === undefined ? validBody : options.body),
    claims: options.claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

describe('POST /notifications', () => {
  beforeEach(() => {
    publishNotificationMock.mockReset();
    publishNotificationMock.mockResolvedValue(summary);
  });

  it('201 con el resumen y el administrador del token como actor', async () => {
    const result = await handler(buildEvent({}));

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual(summary);
    expect(publishNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        segment: 'DEBT',
        title: 'Regulariza tu membresía',
        alsoEmail: false,
        actor: { actorId: 'admin-sub', actorRole: 'admin' },
      }),
    );
  });

  it('reenvía targetMemberId y resourceId solo cuando vienen', async () => {
    await handler(buildEvent({ body: { ...validBody, segment: 'SINGLE', targetMemberId: 'm-1' } }));
    const call = publishNotificationMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['targetMemberId']).toBe('m-1');
    expect('resourceId' in call).toBe(false);
  });

  it('403 para un member', async () => {
    const result = await handler(
      buildEvent({ claims: { sub: 'member-sub', 'cognito:groups': '[member]' } }),
    );
    expect(result.statusCode).toBe(403);
    expect(publishNotificationMock).not.toHaveBeenCalled();
  });

  it('401 sin identidad', async () => {
    const result = await handler(buildEvent({ claims: {} }));
    expect(result.statusCode).toBe(401);
    expect(publishNotificationMock).not.toHaveBeenCalled();
  });

  it.each([
    ['SINGLE sin targetMemberId', { ...validBody, segment: 'SINGLE' }],
    ['BY_RESOURCE sin resourceId', { ...validBody, segment: 'BY_RESOURCE' }],
    ['título vacío', { ...validBody, title: '   ' }],
    ['título de más de 120 caracteres', { ...validBody, title: 'a'.repeat(121) }],
    ['cuerpo de más de 2000 caracteres', { ...validBody, body: 'a'.repeat(2001) }],
    ['segmento desconocido', { ...validBody, segment: 'VIP' }],
    ['alsoEmail ausente', { segment: 'ALL', title: 't', body: 'b' }],
  ])('400 VALIDATION_ERROR: %s', async (_name, body) => {
    const result = await handler(buildEvent({ body }));
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe('VALIDATION_ERROR');
    expect(publishNotificationMock).not.toHaveBeenCalled();
  });

  it('400 con cuerpo ausente o no JSON', async () => {
    expect((await handler(buildEvent({ rawBody: null }))).statusCode).toBe(400);
    expect((await handler(buildEvent({ rawBody: '{no' }))).statusCode).toBe(400);
  });

  it('422 NO_RECIPIENTS cuando el segmento está vacío', async () => {
    publishNotificationMock.mockRejectedValue(new AppError('NO_RECIPIENTS', 'sin destinatarios'));
    const result = await handler(buildEvent({}));
    expect(result.statusCode).toBe(422);
    expect(JSON.parse(result.body).error.code).toBe('NO_RECIPIENTS');
  });

  it('422 RECIPIENT_LIMIT_EXCEEDED y 404 NOT_FOUND se propagan', async () => {
    publishNotificationMock.mockRejectedValueOnce(
      new AppError('RECIPIENT_LIMIT_EXCEEDED', 'demasiados'),
    );
    expect((await handler(buildEvent({}))).statusCode).toBe(422);
    publishNotificationMock.mockRejectedValueOnce(new AppError('NOT_FOUND', 'no existe'));
    expect((await handler(buildEvent({}))).statusCode).toBe(404);
  });

  it('un error inesperado responde 500 sin detalles internos', async () => {
    publishNotificationMock.mockRejectedValue(new Error('dynamo exploded: secret'));
    const result = await handler(buildEvent({}));
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('secret');
  });
});
