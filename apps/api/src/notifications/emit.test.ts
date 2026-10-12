import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { emitNotification, isNotificationEvent, NOTIFICATION_METRICS } = await import('./emit');
const { UnknownNotificationEventError } = await import('./templates');
const { notificationIdFromDedupeKey } = await import('./dedupe');

const NOW = '2026-10-12T15:00:00.000Z';
const recipient = { memberId: 'm1', email: 'ana.perez@example.com', firstName: 'Ana' };
const paymentData = {
  membershipType: 'MONTHLY' as const,
  amount: 12_000,
  membershipEndsAt: '2026-11-12T04:59:59.000Z',
};

type Command = { constructor: { name: string }; input: Record<string, unknown> };

function fakeClient(handler: (command: Command) => unknown | Promise<unknown>) {
  const send = vi.fn(async (command: unknown) => handler(command as Command));
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

function fakeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

type SentMessage = { to: string; subject: string; text: string; html: string };

function fakeSender(impl: () => Promise<void> = async () => undefined) {
  return { send: vi.fn(async (_message: SentMessage) => impl()) };
}

function canceled(codes: string[]) {
  return Object.assign(new Error('Transaction cancelled'), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

describe('emitNotification', () => {
  it('camino feliz: escribe Notification + MemberNotification en una transacción y envía el correo', async () => {
    const client = fakeClient(() => ({}));
    const sender = fakeSender();
    const logger = fakeLogger();

    const result = await emitNotification(
      {
        member: recipient,
        event: 'PAYMENT_SUCCEEDED',
        entityId: 'pay-1',
        data: paymentData,
        now: NOW,
      },
      { client, emailSender: sender, logger },
    );

    const id = notificationIdFromDedupeKey('PAYMENT_SUCCEEDED#m1#pay-1');
    expect(result).toEqual({ inbox: 'WRITTEN', email: 'SENT', notificationId: id });

    expect(client.send).toHaveBeenCalledTimes(1);
    const command = client.send.mock.calls[0]?.[0] as Command;
    expect(command.constructor.name).toBe('TransactWriteCommand');
    const items = command.input['TransactItems'] as {
      Put: { Item: Record<string, unknown>; ConditionExpression: string; TableName: string };
    }[];
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.Put.TableName).toBe('activa-club-test');
      expect(item.Put.ConditionExpression).toBe('attribute_not_exists(PK)');
    }

    expect(items[0]?.Put.Item).toEqual({
      PK: `NOTIFICATION#${id}`,
      SK: 'METADATA',
      GSI2PK: 'NOTIFICATION#SENT',
      GSI2SK: `${NOW}#${id}`,
      entityType: 'Notification',
      notificationId: id,
      title: 'Recibimos tu pago',
      body: expect.stringContaining('S/ 120.00'),
      segment: 'SINGLE',
      targetMemberId: 'm1',
      resourceId: null,
      event: 'PAYMENT_SUCCEEDED',
      alsoEmail: true,
      createdBy: 'SYSTEM',
      recipientCount: 1,
      dedupeKey: 'PAYMENT_SUCCEEDED#m1#pay-1',
      createdAt: NOW,
    });
    expect(items[1]?.Put.Item).toEqual({
      PK: 'MEMBER#m1',
      SK: `NOTIF#${NOW}#${id}`,
      entityType: 'MemberNotification',
      notificationId: id,
      memberId: 'm1',
      title: 'Recibimos tu pago',
      body: expect.stringContaining('S/ 120.00'),
      event: 'PAYMENT_SUCCEEDED',
      readStatus: 'UNREAD',
      createdAt: NOW,
      readAt: null,
    });

    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(sender.send.mock.calls[0]?.[0]).toMatchObject({
      to: 'ana.perez@example.com',
      subject: 'Activa Club: Recibimos tu pago',
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('duplicado idempotente: no reescribe ni reenvía el correo', async () => {
    const client = fakeClient(() => {
      throw canceled(['ConditionalCheckFailed', 'None']);
    });
    const sender = fakeSender();
    const logger = fakeLogger();

    const result = await emitNotification(
      { member: recipient, event: 'PAYMENT_SUCCEEDED', entityId: 'pay-1', data: paymentData },
      { client, emailSender: sender, logger },
    );

    expect(result.inbox).toBe('DUPLICATE');
    expect(result.email).toBe('SKIPPED');
    expect(sender.send).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('el mismo hecho con otro createdAt produce las mismas claves de Notification', async () => {
    const seen: string[] = [];
    const client = fakeClient((command) => {
      const items = command.input['TransactItems'] as { Put: { Item: { PK: string } } }[];
      seen.push(items[0]?.Put.Item.PK ?? '');
      return {};
    });
    const deps = { client, emailSender: null, logger: fakeLogger() };
    const base = { member: recipient, event: 'RENEWAL_DUE', entityId: 'cycle-1' } as const;
    const data = { membershipEndsAt: '2026-10-19T12:00:00.000Z' };
    await emitNotification({ ...base, data, now: '2026-10-12T10:00:00.000Z' }, deps);
    await emitNotification({ ...base, data, now: '2026-10-12T11:00:00.000Z' }, deps);
    expect(seen[0]).toBe(seen[1]);
  });

  it('SES falla: la bandeja queda escrita, no se lanza y se registra warn sin contenido ni correo', async () => {
    const client = fakeClient(() => ({}));
    const sender = fakeSender(async () => {
      throw Object.assign(new Error('Email address is not verified: ana.perez@example.com'), {
        name: 'MessageRejected',
      });
    });
    const logger = fakeLogger();

    const result = await emitNotification(
      { member: recipient, event: 'MEMBER_APPROVED', entityId: 'm1', data: {}, now: NOW },
      { client, emailSender: sender, logger },
    );

    expect(result.inbox).toBe('WRITTEN');
    expect(result.email).toBe('FAILED');
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const [, fields] = logger.warn.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields).toMatchObject({
      event: 'MEMBER_APPROVED',
      memberId: 'm1',
      reason: 'MessageRejected',
      metric: NOTIFICATION_METRICS.EMAIL_SEND_FAILED,
    });
    const serialized = JSON.stringify(logger.warn.mock.calls);
    expect(serialized).not.toContain('ana.perez@example.com');
    expect(serialized).not.toContain('Aprobamos tu solicitud');
  });

  it('la bandeja falla: registra error con métrica, no lanza e igual intenta el correo', async () => {
    const client = fakeClient(() => {
      throw Object.assign(new Error('boom'), { name: 'ProvisionedThroughputExceededException' });
    });
    const sender = fakeSender();
    const logger = fakeLogger();

    const result = await emitNotification(
      { member: recipient, event: 'ACCOUNT_ACTIVATED', entityId: 'm1', data: {}, now: NOW },
      { client, emailSender: sender, logger },
    );

    expect(result.inbox).toBe('FAILED');
    expect(result.email).toBe('SENT');
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [, fields] = logger.error.mock.calls[0] as [string, Record<string, unknown>];
    expect(fields).toMatchObject({
      metric: NOTIFICATION_METRICS.INBOX_WRITE_FAILED,
      event: 'ACCOUNT_ACTIVATED',
      memberId: 'm1',
      outcome: 'FAILURE',
      reason: 'ProvisionedThroughputExceededException',
    });
  });

  it('una cancelación de transacción que no es condicional cuenta como fallo, no duplicado', async () => {
    const client = fakeClient(() => {
      throw canceled(['TransactionConflict', 'None']);
    });
    const result = await emitNotification(
      { member: recipient, event: 'ACCOUNT_ACTIVATED', entityId: 'm1', data: {} },
      { client, emailSender: null, logger: fakeLogger() },
    );
    expect(result.inbox).toBe('FAILED');
  });

  it('bandeja y correo fallan a la vez: no lanza', async () => {
    const client = fakeClient(() => {
      throw new Error('ddb');
    });
    const sender = fakeSender(async () => {
      throw new Error('ses');
    });
    const result = await emitNotification(
      { member: recipient, event: 'ACCOUNT_ACTIVATED', entityId: 'm1', data: {} },
      { client, emailSender: sender, logger: fakeLogger() },
    );
    expect(result).toMatchObject({ inbox: 'FAILED', email: 'FAILED' });
  });

  it('correo omitido si no hay remitente configurado o falta el email del socio', async () => {
    const client = fakeClient(() => ({}));
    const logger = fakeLogger();
    const noSender = await emitNotification(
      { member: recipient, event: 'ACCOUNT_ACTIVATED', entityId: 'm1', data: {} },
      { client, emailSender: null, logger },
    );
    expect(noSender).toMatchObject({ inbox: 'WRITTEN', email: 'SKIPPED' });

    const sender = fakeSender();
    const noEmail = await emitNotification(
      {
        member: { memberId: 'm2', email: null, firstName: 'Luis' },
        event: 'ACCOUNT_ACTIVATED',
        entityId: 'm2',
        data: {},
      },
      { client, emailSender: sender, logger },
    );
    expect(noEmail).toMatchObject({ inbox: 'WRITTEN', email: 'SKIPPED' });
    expect(sender.send).not.toHaveBeenCalled();
    const item = (client.send.mock.calls[1]?.[0] as Command).input['TransactItems'] as {
      Put: { Item: { alsoEmail?: boolean } };
    }[];
    expect(item[0]?.Put.Item.alsoEmail).toBe(false);
  });

  it('resuelve el socio por memberId con una lectura de nombre y correo', async () => {
    const client = fakeClient((command) => {
      if (command.constructor.name === 'GetCommand') {
        return { Item: { memberId: 'm9', email: 'luis@example.com', firstName: 'Luis' } };
      }
      return {};
    });
    const sender = fakeSender();
    const result = await emitNotification(
      { memberId: 'm9', event: 'MEMBER_REJECTED', entityId: 'm9', data: { reason: 'Falta DNI' } },
      { client, emailSender: sender, logger: fakeLogger() },
    );

    const get = client.send.mock.calls[0]?.[0] as Command;
    expect(get.input).toMatchObject({
      TableName: 'activa-club-test',
      Key: { PK: 'MEMBER#m9', SK: 'PROFILE' },
    });
    expect(result).toMatchObject({ inbox: 'WRITTEN', email: 'SENT' });
    expect(sender.send.mock.calls[0]?.[0]).toMatchObject({ to: 'luis@example.com' });
    expect((sender.send.mock.calls[0]?.[0] as { text: string }).text).toContain('Hola Luis,');
  });

  it('socio inexistente o lectura fallida: bandeja FAILED con error registrado, sin lanzar', async () => {
    const logger = fakeLogger();
    const notFound = await emitNotification(
      { memberId: 'nope', event: 'ACCOUNT_ACTIVATED', entityId: 'nope', data: {} },
      { client: fakeClient(() => ({})), emailSender: fakeSender(), logger },
    );
    expect(notFound).toMatchObject({ inbox: 'FAILED', email: 'SKIPPED' });
    expect(logger.error).toHaveBeenCalledTimes(1);

    const broken = await emitNotification(
      { memberId: 'm1', event: 'ACCOUNT_ACTIVATED', entityId: 'm1', data: {} },
      {
        client: fakeClient(() => {
          throw new Error('ddb');
        }),
        emailSender: fakeSender(),
        logger,
      },
    );
    expect(broken.inbox).toBe('FAILED');
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('evento fuera del catálogo y entradas vacías son errores de programación', async () => {
    const deps = { client: fakeClient(() => ({})), emailSender: null, logger: fakeLogger() };
    await expect(
      emitNotification(
        { member: recipient, event: 'OTRO' as never, entityId: 'x', data: {} as never },
        deps,
      ),
    ).rejects.toBeInstanceOf(UnknownNotificationEventError);
    await expect(
      emitNotification(
        { member: recipient, event: 'ACCOUNT_ACTIVATED', entityId: '', data: {} },
        deps,
      ),
    ).rejects.toThrow(TypeError);
    await expect(
      emitNotification({ memberId: '', event: 'ACCOUNT_ACTIVATED', entityId: 'x', data: {} }, deps),
    ).rejects.toThrow(TypeError);
    expect(deps.client.send).not.toHaveBeenCalled();
  });

  it('los textos persistidos y enviados no contienen datos sensibles pasados como extras', async () => {
    const client = fakeClient(() => ({}));
    const sender = fakeSender();
    await emitNotification(
      {
        member: recipient,
        event: 'PAYMENT_SUCCEEDED',
        entityId: 'pay-2',
        data: { ...paymentData, stripePaymentIntentId: 'pi_secret', cardLast4: '4242' } as never,
        now: NOW,
      },
      { client, emailSender: sender, logger: fakeLogger() },
    );
    const written = JSON.stringify(client.send.mock.calls);
    const sent = JSON.stringify(sender.send.mock.calls);
    expect(written).not.toMatch(/pi_secret|4242/);
    expect(sent).not.toMatch(/pi_secret|4242/);
  });
});

describe('isNotificationEvent', () => {
  it('reconoce el catálogo y rechaza otros valores', () => {
    expect(isNotificationEvent('RESERVATION_REMINDER')).toBe(true);
    expect(isNotificationEvent('NOPE')).toBe(false);
    expect(isNotificationEvent(undefined)).toBe(false);
  });
});
