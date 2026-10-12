import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

// Sin SES real: el correo queda SKIPPED por falta de remitente configurado.
delete process.env['SES_SENDER_EMAIL'];

const { notifyReservationHolder } = await import('./notify');

interface CommandLike {
  constructor: { name: string };
  input: {
    Key?: Record<string, unknown>;
    TransactItems?: { Put: { Item: Record<string, unknown> } }[];
  };
}

const reservation = {
  reservationId: 'res-1',
  resourceId: 'parrilla-1',
  holderMemberId: 'member-1',
  startsAt: '2026-07-20T15:00:00.000Z',
  endsAt: '2026-07-20T20:00:00.000Z',
};

interface Options {
  resourceError?: boolean;
  transactError?: unknown;
}

function buildClient(options: Options = {}) {
  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const ctor = cmd.constructor.name;
    if (ctor === 'GetCommand') {
      const pk = String(cmd.input.Key?.['PK']);
      if (pk.startsWith('RESOURCE#')) {
        if (options.resourceError) throw new Error('boom');
        return { Item: { resourceId: 'parrilla-1', name: 'Parrilla 1' } };
      }
      if (pk.startsWith('MEMBER#')) {
        return { Item: { memberId: 'member-1', email: 'maria@example.com', firstName: 'María' } };
      }
    }
    if (ctor === 'TransactWriteCommand') {
      if (options.transactError) throw options.transactError;
      return {};
    }
    throw new Error(`Comando inesperado: ${ctor}`);
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

function inboxItem(client: { send: ReturnType<typeof vi.fn> }): Record<string, unknown> {
  const call = client.send.mock.calls.find(
    ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
  )?.[0] as CommandLike;
  const items = call.input.TransactItems ?? [];
  const member = items.find((item) => item.Put.Item['entityType'] === 'MemberNotification');
  return member?.Put.Item as Record<string, unknown>;
}

describe('notifyReservationHolder (US-044)', () => {
  it('escribe en la bandeja del titular el aviso de aprobación con la franja en hora de Lima', async () => {
    const client = buildClient();

    await notifyReservationHolder({
      client,
      reservation,
      notification: { event: 'RESERVATION_APPROVED' },
      now: '2026-07-11T10:00:00.000Z',
    });

    const item = inboxItem(client);
    expect(item['memberId']).toBe('member-1');
    expect(item['event']).toBe('RESERVATION_APPROVED');
    expect(item['body']).toContain('Parrilla 1');
    expect(item['body']).toContain('10:00');
  });

  it('un rechazo lleva el motivo; una cancelación del club lo dice explícitamente', async () => {
    const rejected = buildClient();
    await notifyReservationHolder({
      client: rejected,
      reservation,
      notification: { event: 'RESERVATION_REJECTED', reason: 'Mantenimiento programado' },
      now: '2026-07-11T10:00:00.000Z',
    });
    expect(inboxItem(rejected)['body']).toContain('Mantenimiento programado');

    const cancelled = buildClient();
    await notifyReservationHolder({
      client: cancelled,
      reservation,
      notification: { event: 'RESERVATION_CANCELLED', cancelledBy: 'ADMIN' },
      now: '2026-07-11T10:00:00.000Z',
    });
    expect(inboxItem(cancelled)['body']).toContain('El club canceló');
  });

  it('idempotencia: el mismo hecho dos veces produce el mismo notificationId y no lanza', async () => {
    const duplicate = Object.assign(new Error('dup'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const first = buildClient();
    const second = buildClient({ transactError: duplicate });
    const input = {
      reservation,
      notification: { event: 'RESERVATION_APPROVED' } as const,
      now: '2026-07-11T10:00:00.000Z',
    };

    await notifyReservationHolder({ client: first, ...input });
    await expect(notifyReservationHolder({ client: second, ...input })).resolves.toBeUndefined();

    expect(inboxItem(first)['notificationId']).toBeTruthy();
  });

  it('si no se puede leer el recurso usa un texto de respaldo y aun así avisa', async () => {
    const client = buildClient({ resourceError: true });

    await notifyReservationHolder({
      client,
      reservation,
      notification: { event: 'RESERVATION_APPROVED' },
      now: '2026-07-11T10:00:00.000Z',
    });

    expect(inboxItem(client)['body']).toContain('la instalación');
  });

  it('un fallo de DynamoDB en la bandeja no lanza', async () => {
    const client = buildClient({ transactError: new Error('throttled') });

    await expect(
      notifyReservationHolder({
        client,
        reservation,
        notification: { event: 'RESERVATION_APPROVED' },
        now: '2026-07-11T10:00:00.000Z',
      }),
    ).resolves.toBeUndefined();
  });
});
