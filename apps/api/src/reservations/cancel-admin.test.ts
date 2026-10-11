import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { cancelReservation } = await import('./cancel');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, unknown>;
    Item?: Record<string, unknown>;
    TransactItems?: { Update?: { Key: Record<string, unknown> } }[];
  };
}

function fakeClient(send: (command: unknown) => Promise<unknown>) {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const member = { memberId: 'member-1', cognitoSub: 'sub-1' };

const reservationRaw = {
  entityType: 'Reservation',
  reservationId: 'res-1',
  resourceId: 'futbol-1',
  resourceType: 'FUTBOL',
  holderMemberId: 'member-1',
  startsAt: '2026-07-12T11:00:00.000Z',
  endsAt: '2026-07-12T12:30:00.000Z',
  reservationStatus: 'CONFIRMED',
  participantCount: 1,
  guestCount: 0,
  requiresApproval: false,
  rejectionReason: null,
  cancelledAt: null,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
};

const guestParticipantRaw = {
  entityType: 'ReservationParticipant',
  participantId: 'part-2',
  reservationId: 'res-1',
  participantType: 'GUEST',
  memberId: null,
  guestDni: '70605040',
  guestName: 'Ana Torres',
  startsAt: reservationRaw.startsAt,
  endsAt: reservationRaw.endsAt,
};

const guestCounterRaw = {
  guestDni: '70605040',
  month: '2026-07',
  visitCount: 1,
  reservationIds: ['res-1'],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function buildClient(options: {
  reservation: Record<string, unknown> | null;
  participants?: Record<string, unknown>[];
  guestCounters?: Record<string, Record<string, unknown>>;
}) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
      return { Items: [member] };
    }
    if (cmd.constructor.name === 'GetCommand') {
      const pk = (cmd.input.Key?.['PK'] as string | undefined) ?? '';
      const sk = (cmd.input.Key?.['SK'] as string | undefined) ?? '';
      if (pk.startsWith('RESERVATION#')) {
        return options.reservation ? { Item: options.reservation } : {};
      }
      if (pk.startsWith('GUEST#') && sk.startsWith('MONTH#')) {
        const counter = options.guestCounters?.[pk.slice('GUEST#'.length)];
        return counter ? { Item: counter } : {};
      }
      throw new Error(`GetCommand inesperado: PK=${pk} SK=${sk}`);
    }
    if (cmd.constructor.name === 'QueryCommand') {
      return { Items: options.participants ?? [] };
    }
    if (cmd.constructor.name === 'TransactWriteCommand' || cmd.constructor.name === 'PutCommand') {
      return {};
    }
    throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
  });
}

function callsOf(client: { send: ReturnType<typeof vi.fn> }, name: string): CommandLike[] {
  return client.send.mock.calls
    .map(([command]) => command as CommandLike)
    .filter((command) => command.constructor.name === name);
}

describe('cancelReservation como admin (US-036, criterio 10)', () => {
  const adminSub = 'admin-sub-1';
  // 11h antes de startsAt: un socio recibiría CANCELLATION_TOO_LATE.
  const tooLateNow = new Date('2026-07-12T00:00:00.000Z');

  const adminInput = (client: DynamoDBDocumentClient, reservationId = 'res-1') => ({
    cognitoSub: adminSub,
    actorRole: 'admin' as const,
    reservationId,
    client,
    now: tooLateNow,
  });

  it('permite cancelar a menos de 24h del inicio y no busca al admin como socio', async () => {
    const client = buildClient({ reservation: reservationRaw });

    const result = await cancelReservation(adminInput(client));

    expect(result).toEqual({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
    const memberLookups = callsOf(client, 'QueryCommand').filter(
      (command) => command.input.IndexName === 'GSI1',
    );
    expect(memberLookups).toHaveLength(0);
  });

  it('permite cancelar la reserva de otro socio (sin exigir titularidad)', async () => {
    const client = buildClient({
      reservation: { ...reservationRaw, holderMemberId: 'member-otro' },
    });

    const result = await cancelReservation(adminInput(client));

    expect(result.reservationStatus).toBe('CANCELLED');
  });

  it('devuelve el cupo mensual de los invitados externos', async () => {
    const client = buildClient({
      reservation: { ...reservationRaw, guestCount: 1, participantCount: 2 },
      participants: [guestParticipantRaw],
      guestCounters: { '70605040': guestCounterRaw },
    });

    await cancelReservation(adminInput(client));

    const items = callsOf(client, 'TransactWriteCommand')[0]?.input.TransactItems ?? [];
    expect(items).toHaveLength(2);
    expect(items[1]?.Update?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
  });

  it('audita RESERVATION_CANCELLED con actorRole admin y el sub como actorId', async () => {
    const client = buildClient({ reservation: reservationRaw });

    await cancelReservation(adminInput(client));

    const item = callsOf(client, 'PutCommand')[0]?.input.Item;
    expect(item?.['action']).toBe('RESERVATION_CANCELLED');
    expect(item?.['actorId']).toBe(adminSub);
    expect(item?.['actorRole']).toBe('admin');
    expect(item?.['targetId']).toBe('res-1');
  });

  it.each(['CANCELLED', 'REJECTED'])('409 CONFLICT si la reserva ya está %s', async (status) => {
    const client = buildClient({ reservation: { ...reservationRaw, reservationStatus: status } });

    await expect(cancelReservation(adminInput(client))).rejects.toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }),
    );
    expect(callsOf(client, 'TransactWriteCommand')).toHaveLength(0);
  });

  it('404 NOT_FOUND si la reserva no existe', async () => {
    const client = buildClient({ reservation: null });

    await expect(cancelReservation(adminInput(client, 'res-x'))).rejects.toThrowError(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('regresión: el socio mantiene la regla de 24h y el 404 en reserva ajena', async () => {
    const tooLate = buildClient({ reservation: reservationRaw });
    await expect(
      cancelReservation({
        cognitoSub: 'sub-1',
        actorRole: 'member',
        reservationId: 'res-1',
        client: tooLate,
        now: tooLateNow,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CANCELLATION_TOO_LATE' }));

    const foreign = buildClient({
      reservation: { ...reservationRaw, holderMemberId: 'member-otro' },
    });
    await expect(
      cancelReservation({
        cognitoSub: 'sub-1',
        reservationId: 'res-1',
        client: foreign,
        now: new Date('2026-07-10T00:00:00.000Z'),
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});
