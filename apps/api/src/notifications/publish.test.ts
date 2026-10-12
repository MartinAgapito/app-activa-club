import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const resolveMock = vi.fn();
vi.mock('./segments', () => ({ resolveSegmentRecipients: resolveMock }));

const { publishNotification, publicationId, IDEMPOTENCY_WINDOW_MS, TRANSACTION_BLOCK_SIZE } =
  await import('./publish');

const NOW = new Date('2026-10-12T15:00:00.000Z');
const actor = { actorId: 'admin-1', actorRole: 'admin' as const };

type Command = { constructor: { name: string }; input: Record<string, unknown> };
type Item = Record<string, unknown>;

interface Sink {
  /** Items persistidos por `PK|SK` (simula la tabla). */
  table: Map<string, Item>;
  commands: Command[];
  failTransactionAt?: number;
}

function conditionalFailure(): Error {
  return Object.assign(new Error('conditional'), {
    name: 'TransactionCanceledException',
    CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
  });
}

/** Cliente falso con una tabla en memoria que respeta `attribute_not_exists(PK)`. */
function fakeClient(sink: Sink) {
  let transactions = 0;
  const put = (item: Item, conditional: boolean): void => {
    const key = `${String(item['PK'])}|${String(item['SK'])}`;
    if (conditional && sink.table.has(key)) throw conditionalFailure();
    sink.table.set(key, item);
  };
  const send = vi.fn(async (raw: unknown) => {
    const command = raw as Command;
    sink.commands.push(command);
    const name = command.constructor.name;
    if (name === 'GetCommand') {
      const key = command.input['Key'] as { PK: string; SK: string };
      return { Item: sink.table.get(`${key.PK}|${key.SK}`) };
    }
    if (name === 'PutCommand') {
      try {
        put(command.input['Item'] as Item, command.input['ConditionExpression'] !== undefined);
      } catch {
        throw Object.assign(new Error('c'), { name: 'ConditionalCheckFailedException' });
      }
      return {};
    }
    if (name === 'TransactWriteCommand') {
      transactions += 1;
      if (sink.failTransactionAt === transactions) {
        throw Object.assign(new Error('boom'), { name: 'InternalServerError' });
      }
      const items = command.input['TransactItems'] as {
        Put: { Item: Item; ConditionExpression?: string };
      }[];
      // Atomicidad: valida todo antes de escribir.
      for (const { Put } of items) {
        const key = `${String(Put.Item['PK'])}|${String(Put.Item['SK'])}`;
        if (Put.ConditionExpression && sink.table.has(key)) throw conditionalFailure();
      }
      for (const { Put } of items) put(Put.Item, false);
      return {};
    }
    throw new Error(`comando inesperado ${name}`);
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

function newSink(): Sink {
  return { table: new Map(), commands: [] };
}

function members(n: number, withEmail = true) {
  return Array.from({ length: n }, (_, i) => ({
    memberId: `m${i}`,
    email: withEmail ? `m${i}@example.com` : null,
    firstName: `S${i}`,
  }));
}

function logger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function emailDeps(send = vi.fn(async () => undefined)) {
  let t = NOW.getTime();
  return {
    send,
    deps: {
      emailSender: { send },
      clock: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    },
  };
}

const baseInput = {
  segment: 'DEBT' as const,
  title: 'Regulariza tu membresía',
  body: 'Tienes un saldo pendiente.',
  alsoEmail: false,
  actor,
  now: NOW,
};

function inboxItems(sink: Sink): Item[] {
  return [...sink.table.values()].filter((i) => i['entityType'] === 'MemberNotification');
}
function notificationItems(sink: Sink): Item[] {
  return [...sink.table.values()].filter((i) => i['entityType'] === 'Notification');
}
function auditItems(sink: Sink): Item[] {
  return [...sink.table.values()].filter((i) => i['entityType'] === 'AuditLog');
}

describe('publishNotification', () => {
  beforeEach(() => {
    resolveMock.mockReset();
  });

  it('camino feliz: Notification + una bandeja por destinatario + auditoría', async () => {
    resolveMock.mockResolvedValue(members(3));
    const sink = newSink();
    const client = fakeClient(sink);

    const result = await publishNotification({ ...baseInput, client, logger: logger() });

    expect(result).toMatchObject({
      recipientCount: 3,
      emailsSent: 0,
      emailsFailed: 0,
      emailsSkipped: 0,
      replayed: false,
    });
    const [notification] = notificationItems(sink);
    expect(notification).toMatchObject({
      PK: `NOTIFICATION#${result.notificationId}`,
      SK: 'METADATA',
      GSI2PK: 'NOTIFICATION#SENT',
      GSI2SK: `${NOW.toISOString()}#${result.notificationId}`,
      segment: 'DEBT',
      title: 'Regulariza tu membresía',
      createdBy: 'admin-1',
      recipientCount: 3,
      alsoEmail: false,
      event: null,
      targetMemberId: null,
      resourceId: null,
    });
    const inbox = inboxItems(sink);
    expect(inbox.map((i) => i['memberId']).sort()).toEqual(['m0', 'm1', 'm2']);
    expect(inbox.every((i) => i['readStatus'] === 'UNREAD' && i['event'] === null)).toBe(true);
    expect(inbox[0]).toMatchObject({
      PK: 'MEMBER#m0',
      SK: `NOTIF#${NOW.toISOString()}#${result.notificationId}`,
    });
  });

  it('la auditoría NOTIFICATION_SENT lleva admin, segmento y recipientCount', async () => {
    resolveMock.mockResolvedValue(members(2));
    const sink = newSink();
    const result = await publishNotification({
      ...baseInput,
      segment: 'SINGLE',
      targetMemberId: 'm0',
      client: fakeClient(sink),
      logger: logger(),
    });

    const [audit] = auditItems(sink);
    expect(audit).toMatchObject({
      action: 'NOTIFICATION_SENT',
      actorId: 'admin-1',
      actorRole: 'admin',
      targetType: 'Notification',
      targetId: result.notificationId,
      metadata: expect.objectContaining({
        segment: 'SINGLE',
        recipientCount: 2,
        targetMemberId: 'm0',
      }),
    });
  });

  it('segmento vacío: 422 NO_RECIPIENTS y no escribe nada', async () => {
    resolveMock.mockResolvedValue([]);
    const sink = newSink();
    const client = fakeClient(sink);

    await expect(publishNotification({ ...baseInput, client })).rejects.toMatchObject({
      code: 'NO_RECIPIENTS',
    });
    expect(client.send).not.toHaveBeenCalled();
    expect(sink.table.size).toBe(0);
  });

  it('propaga errores de resolución (404 / tope) sin escribir', async () => {
    const error = Object.assign(new Error('x'), { code: 'NOT_FOUND' });
    resolveMock.mockRejectedValue(error);
    const sink = newSink();
    await expect(publishNotification({ ...baseInput, client: fakeClient(sink) })).rejects.toBe(
      error,
    );
    expect(sink.table.size).toBe(0);
  });

  it('más de 99 destinatarios: bloques de a lo sumo 100 ítems con la Notification en el primero', async () => {
    resolveMock.mockResolvedValue(members(250));
    const sink = newSink();
    const client = fakeClient(sink);

    const result = await publishNotification({ ...baseInput, client, logger: logger() });

    expect(result.recipientCount).toBe(250);
    const transactions = sink.commands.filter((c) => c.constructor.name === 'TransactWriteCommand');
    const sizes = transactions.map((c) => (c.input['TransactItems'] as unknown[]).length);
    expect(sizes).toEqual([100, 100, 51]); // 1 + 99, 100, 51
    expect(Math.max(...sizes)).toBeLessThanOrEqual(TRANSACTION_BLOCK_SIZE);
    const first = (transactions[0]?.input['TransactItems'] as { Put: { Item: Item } }[])[0];
    expect(first?.Put.Item['entityType']).toBe('Notification');
    expect(inboxItems(sink)).toHaveLength(250);
    expect(notificationItems(sink)[0]?.['recipientCount']).toBe(250);
  });

  it('solo usa PutItem/GetItem/TransactWrite de Put (IAM concedido), sin Batch ni Update', async () => {
    resolveMock.mockResolvedValue(members(120));
    const sink = newSink();
    await publishNotification({ ...baseInput, client: fakeClient(sink), logger: logger() });
    const names = new Set(sink.commands.map((c) => c.constructor.name));
    expect(
      [...names].every((n) => ['GetCommand', 'PutCommand', 'TransactWriteCommand'].includes(n)),
    ).toBe(true);
    for (const c of sink.commands.filter((x) => x.constructor.name === 'TransactWriteCommand')) {
      for (const item of c.input['TransactItems'] as Record<string, unknown>[]) {
        expect(Object.keys(item)).toEqual(['Put']);
      }
    }
  });

  describe('correo', () => {
    it('alsoEmail=false no envía ningún correo', async () => {
      resolveMock.mockResolvedValue(members(3));
      const { send, deps } = emailDeps();
      const result = await publishNotification({
        ...baseInput,
        client: fakeClient(newSink()),
        email: deps,
        logger: logger(),
      });
      expect(send).not.toHaveBeenCalled();
      expect(result.emailsSent).toBe(0);
      expect(result.emailsSkipped).toBe(0);
    });

    it('alsoEmail=true envía y resume los correos', async () => {
      resolveMock.mockResolvedValue(members(3));
      const { send, deps } = emailDeps();
      const result = await publishNotification({
        ...baseInput,
        alsoEmail: true,
        client: fakeClient(newSink()),
        email: deps,
        logger: logger(),
      });
      expect(send).toHaveBeenCalledTimes(3);
      expect(result).toMatchObject({
        recipientCount: 3,
        emailsSent: 3,
        emailsFailed: 0,
        emailsSkipped: 0,
      });
    });

    it('fallo parcial de SES: la bandeja queda completa y no devuelve error', async () => {
      resolveMock.mockResolvedValue(members(3));
      const send = vi
        .fn<(m: unknown) => Promise<void>>()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'MessageRejected' }))
        .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'Throttling' }));
      const { deps } = emailDeps(send as never);
      const sink = newSink();
      const result = await publishNotification({
        ...baseInput,
        alsoEmail: true,
        client: fakeClient(sink),
        email: deps,
        logger: logger(),
      });
      expect(result).toMatchObject({ recipientCount: 3, emailsSent: 1, emailsFailed: 2 });
      expect(inboxItems(sink)).toHaveLength(3);
    });

    it('con más socios que el tope, informa emailsSkipped y la bandeja llega a todos', async () => {
      resolveMock.mockResolvedValue(members(40));
      const { send, deps } = emailDeps();
      const sink = newSink();
      const result = await publishNotification({
        ...baseInput,
        alsoEmail: true,
        client: fakeClient(sink),
        email: deps,
        logger: logger(),
      });
      expect(result.recipientCount).toBe(40);
      expect(result.emailsSent).toBe(send.mock.calls.length);
      expect(result.emailsSent + result.emailsSkipped).toBe(40);
      expect(result.emailsSkipped).toBeGreaterThan(0);
      expect(inboxItems(sink)).toHaveLength(40);
    });

    it('sin remitente configurado: bandeja completa y todo omitido', async () => {
      resolveMock.mockResolvedValue(members(2));
      const result = await publishNotification({
        ...baseInput,
        alsoEmail: true,
        client: fakeClient(newSink()),
        email: { emailSender: null },
        logger: logger(),
      });
      expect(result).toMatchObject({ recipientCount: 2, emailsSent: 0, emailsSkipped: 2 });
    });
  });

  describe('idempotencia', () => {
    it('una solicitud idéntica repetida no duplica bandeja, auditoría ni correos', async () => {
      resolveMock.mockResolvedValue(members(3));
      const sink = newSink();
      const client = fakeClient(sink);
      const { send, deps } = emailDeps();
      const input = { ...baseInput, alsoEmail: true, client, email: deps, logger: logger() };

      const first = await publishNotification(input);
      const second = await publishNotification({ ...input, now: new Date(NOW.getTime() + 30_000) });

      expect(second.notificationId).toBe(first.notificationId);
      expect(second).toMatchObject({
        recipientCount: 3,
        replayed: true,
        emailsSent: 0,
        emailsFailed: 0,
        emailsSkipped: 0,
      });
      expect(inboxItems(sink)).toHaveLength(3);
      expect(notificationItems(sink)).toHaveLength(1);
      expect(auditItems(sink)).toHaveLength(1);
      expect(send).toHaveBeenCalledTimes(3);
    });

    it('el mismo texto fuera de la ventana es una publicación nueva', async () => {
      resolveMock.mockResolvedValue(members(2));
      const sink = newSink();
      const client = fakeClient(sink);
      const first = await publishNotification({ ...baseInput, client, logger: logger() });
      const second = await publishNotification({
        ...baseInput,
        client,
        logger: logger(),
        now: new Date(NOW.getTime() + IDEMPOTENCY_WINDOW_MS + 1),
      });
      expect(second.notificationId).not.toBe(first.notificationId);
      expect(second.replayed).toBe(false);
      expect(inboxItems(sink)).toHaveLength(4);
      expect(auditItems(sink)).toHaveLength(2);
    });

    it('distinto texto, segmento o administrador producen otro id', () => {
      const t = NOW.getTime();
      const id = publicationId(baseInput, t);
      expect(publicationId({ ...baseInput, body: 'otro' }, t)).not.toBe(id);
      expect(publicationId({ ...baseInput, segment: 'ALL' }, t)).not.toBe(id);
      expect(publicationId({ ...baseInput, alsoEmail: true }, t)).not.toBe(id);
      expect(publicationId({ ...baseInput, actor: { ...actor, actorId: 'admin-2' } }, t)).not.toBe(
        id,
      );
      expect(publicationId(baseInput, t)).toBe(id);
      expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    });

    it('fallo en un bloque posterior: 500, conteo real en la Notification y el reintento completa sin duplicar', async () => {
      resolveMock.mockResolvedValue(members(250));
      const sink = newSink();
      sink.failTransactionAt = 2; // cae el segundo bloque
      const client = fakeClient(sink);
      const log = logger();

      await expect(
        publishNotification({ ...baseInput, client, logger: log }),
      ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });

      expect(inboxItems(sink)).toHaveLength(99);
      expect(notificationItems(sink)[0]?.['recipientCount']).toBe(99);
      expect(log.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metric: 'NOTIFICATION_PUBLISH_PARTIAL',
          written: 99,
          planned: 250,
        }),
      );

      // Reintento idéntico: reutiliza createdAt y completa lo que falta.
      delete sink.failTransactionAt;
      const retry = await publishNotification({
        ...baseInput,
        client,
        logger: logger(),
        now: new Date(NOW.getTime() + 20_000),
      });
      expect(retry).toMatchObject({ recipientCount: 250, replayed: true });
      const inbox = inboxItems(sink);
      expect(inbox).toHaveLength(250);
      expect(new Set(inbox.map((i) => i['createdAt']))).toEqual(new Set([NOW.toISOString()]));
      expect(notificationItems(sink)[0]?.['recipientCount']).toBe(250);
      expect(auditItems(sink)).toHaveLength(1);
    });

    it('un fallo en el primer bloque no deja bandeja ni Notification', async () => {
      resolveMock.mockResolvedValue(members(5));
      const sink = newSink();
      sink.failTransactionAt = 1;
      await expect(
        publishNotification({ ...baseInput, client: fakeClient(sink), logger: logger() }),
      ).rejects.toThrow();
      expect(inboxItems(sink)).toHaveLength(0);
      expect(notificationItems(sink)).toHaveLength(0);
    });
  });

  it('SINGLE guarda targetMemberId y BY_RESOURCE guarda resourceId en la Notification', async () => {
    resolveMock.mockResolvedValue(members(1));
    const sink = newSink();
    await publishNotification({
      ...baseInput,
      segment: 'BY_RESOURCE',
      resourceId: 'piscina-1',
      targetMemberId: 'ignorado',
      client: fakeClient(sink),
      logger: logger(),
    });
    expect(notificationItems(sink)[0]).toMatchObject({
      segment: 'BY_RESOURCE',
      resourceId: 'piscina-1',
      targetMemberId: null,
    });
  });

  it('el título y el cuerpo se guardan literales (texto plano)', async () => {
    resolveMock.mockResolvedValue(members(1));
    const sink = newSink();
    await publishNotification({
      ...baseInput,
      title: '<b>Hola</b>',
      body: '<img src=x onerror=alert(1)>',
      client: fakeClient(sink),
      logger: logger(),
    });
    expect(inboxItems(sink)[0]).toMatchObject({
      title: '<b>Hola</b>',
      body: '<img src=x onerror=alert(1)>',
    });
  });

  it('los logs no llevan el contenido del aviso ni correos', async () => {
    resolveMock.mockResolvedValue(members(2));
    const log = logger();
    const { deps } = emailDeps();
    await publishNotification({
      ...baseInput,
      alsoEmail: true,
      client: fakeClient(newSink()),
      email: deps,
      logger: log,
    });
    const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls, log.error.mock.calls]);
    expect(logged).not.toContain('Tienes un saldo pendiente');
    expect(logged).not.toContain('example.com');
  });
});
