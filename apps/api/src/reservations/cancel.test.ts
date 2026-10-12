import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// US-044: el emisor real se prueba en notifications/ y notify.test.ts; aquí se
// verifica qué evento y qué datos pide el orquestador.
vi.mock('../notifications', () => ({ emitNotification: vi.fn() }));

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { cancelReservation } = await import('./cancel');
const { emitNotification } = await import('../notifications');
const emitMock = vi.mocked(emitNotification);

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, unknown>;
    TransactItems?: {
      Update?: { Key: Record<string, unknown>; ConditionExpression?: string };
    }[];
  };
}

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const member = { memberId: 'member-1', cognitoSub: 'sub-1' };

const baseReservationRaw = {
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
  startsAt: '2026-07-12T11:00:00.000Z',
  endsAt: '2026-07-12T12:30:00.000Z',
};

const guestCounterRaw = {
  guestDni: '70605040',
  month: '2026-07',
  visitCount: 1,
  reservationIds: ['res-1'],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

interface BuildClientOptions {
  reservation?: Record<string, unknown> | null;
  participants?: Record<string, unknown>[];
  guestCounters?: Record<string, Record<string, unknown> | undefined>;
  writeError?: Error;
}

function buildClient(options: BuildClientOptions) {
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
      if (pk.startsWith('RESOURCE#')) {
        // US-044: nombre de la instalación para el aviso.
        return { Item: { resourceId: 'futbol-1', name: 'Cancha de fútbol 1' } };
      }
      if (pk.startsWith('GUEST#') && sk.startsWith('MONTH#')) {
        const dni = pk.slice('GUEST#'.length);
        const counter = options.guestCounters?.[dni];
        return counter ? { Item: counter } : {};
      }
      throw new Error(`GetCommand inesperado: PK=${pk} SK=${sk}`);
    }
    if (cmd.constructor.name === 'QueryCommand') {
      return { Items: options.participants ?? [] };
    }
    if (cmd.constructor.name === 'TransactWriteCommand') {
      if (options.writeError) throw options.writeError;
      return {};
    }
    if (cmd.constructor.name === 'PutCommand') {
      return {};
    }
    throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
  });
}

describe('cancelReservation (US-033, criterios 5-12)', () => {
  const farEnoughNow = new Date('2026-07-10T00:00:00.000Z'); // > 24h antes de startsAt

  it('criterio 5: cancela con más de 24h de anticipación y responde CANCELLED', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });

    const result = await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    expect(result).toEqual({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
  });

  it('criterio 6: a menos de 24h del inicio devuelve CANCELLATION_TOO_LATE y no escribe nada', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });
    const tooLateNow = new Date('2026-07-12T00:00:00.000Z'); // 11h antes de startsAt

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: tooLateNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CANCELLATION_TOO_LATE' }));

    const writeCalls = (client.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    );
    expect(writeCalls).toHaveLength(0);
  });

  it('borde exacto de 24h (criterio, caso alternativo): permite cancelar', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });
    const exactlyBoundaryNow = new Date('2026-07-11T11:00:00.000Z'); // exactamente 24h antes

    const result = await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: exactlyBoundaryNow,
    });

    expect(result.reservationStatus).toBe('CANCELLED');
  });

  it('criterio 7: una reserva PENDING_APPROVAL también es cancelable por el socio', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, reservationStatus: 'PENDING_APPROVAL' },
      participants: [],
    });

    const result = await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    expect(result.reservationStatus).toBe('CANCELLED');
  });

  it('criterio 8: una reserva ya CANCELLED devuelve CONFLICT sin volver a escribir', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, reservationStatus: 'CANCELLED' },
      participants: [],
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CONFLICT' }));

    const writeCalls = (client.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    );
    expect(writeCalls).toHaveLength(0);
  });

  it('criterio 8: una reserva ya REJECTED devuelve CONFLICT', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, reservationStatus: 'REJECTED' },
      participants: [],
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
  });

  it('criterio 9: NOT_FOUND si la reserva no existe', async () => {
    const client = buildClient({ reservation: null });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-x', client, now: farEnoughNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('criterio 9: NOT_FOUND (no FORBIDDEN) si el socio autenticado no es el titular', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, holderMemberId: 'member-otro' },
      participants: [],
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('criterio 10: decrementa el contador mensual de cada invitado externo de la reserva', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, guestCount: 1, participantCount: 2 },
      participants: [guestParticipantRaw],
      guestCounters: { '70605040': guestCounterRaw },
    });

    await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    const transactCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const items = transactCall.input.TransactItems ?? [];
    expect(items).toHaveLength(2);
    expect(items[1]?.Update?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
  });

  it('no decrementa nada si el contador del invitado ya no existiera (defensivo)', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, guestCount: 1, participantCount: 2 },
      participants: [guestParticipantRaw],
      guestCounters: {},
    });

    await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    const transactCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    expect(transactCall.input.TransactItems).toHaveLength(1);
  });

  it('criterio 12: deja auditoría RESERVATION_CANCELLED', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });

    await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    const auditCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'PutCommand',
    )?.[0] as { input: { Item: Record<string, unknown> } };
    expect(auditCall.input.Item['action']).toBe('RESERVATION_CANCELLED');
    expect(auditCall.input.Item['actorId']).toBe('member-1');
  });

  it('traduce ALREADY_DECIDED (carrera en la condición de la transacción) a CONFLICT', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const client = buildClient({
      reservation: baseReservationRaw,
      participants: [],
      writeError: conditionalError,
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'CONFLICT' }));
  });
});

describe('cancelReservation - aviso al titular (US-044, criterios 4/6/9)', () => {
  const farEnoughNow = new Date('2026-07-10T00:00:00.000Z');

  beforeEach(() => {
    emitMock.mockReset();
    emitMock.mockResolvedValue({ inbox: 'WRITTEN', email: 'SENT', notificationId: 'n-1' });
  });

  it('cancelación del socio titular: emite RESERVATION_CANCELLED con cancelledBy MEMBER', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });

    await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock.mock.calls[0]?.[0]).toMatchObject({
      event: 'RESERVATION_CANCELLED',
      entityId: 'res-1',
      memberId: 'member-1',
      data: {
        resourceName: 'Cancha de fútbol 1',
        startsAt: baseReservationRaw.startsAt,
        endsAt: baseReservationRaw.endsAt,
        cancelledBy: 'MEMBER',
      },
    });
  });

  it('cancelación del administrador: avisa al titular (no al admin) con cancelledBy ADMIN', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, holderMemberId: 'member-otro' },
      participants: [],
    });

    await cancelReservation({
      cognitoSub: 'admin-sub',
      actorRole: 'admin',
      reservationId: 'res-1',
      client,
      now: new Date('2026-07-12T10:00:00.000Z'), // < 24h: el admin está exento
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    const input = emitMock.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      event: 'RESERVATION_CANCELLED',
      memberId: 'member-otro',
      data: { cancelledBy: 'ADMIN' },
    });
    expect(JSON.stringify(input)).not.toContain('admin-sub');
  });

  it('criterio 6: CANCELLATION_TOO_LATE no emite', async () => {
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });

    await expect(
      cancelReservation({
        cognitoSub: 'sub-1',
        reservationId: 'res-1',
        client,
        now: new Date('2026-07-12T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'CANCELLATION_TOO_LATE' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('una reserva ya cancelada (409 CONFLICT) no emite', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, reservationStatus: 'CANCELLED' },
      participants: [],
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('una carrera perdida en la transacción (ALREADY_DECIDED) no emite', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const client = buildClient({
      reservation: baseReservationRaw,
      participants: [],
      writeError: conditionalError,
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('un titular ajeno (404) no emite', async () => {
    const client = buildClient({
      reservation: { ...baseReservationRaw, holderMemberId: 'member-otro' },
      participants: [],
    });

    await expect(
      cancelReservation({ cognitoSub: 'sub-1', reservationId: 'res-1', client, now: farEnoughNow }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('criterio 9: un emisor que rechaza no altera la respuesta', async () => {
    emitMock.mockRejectedValueOnce(new Error('SES caído'));
    const client = buildClient({ reservation: baseReservationRaw, participants: [] });

    const result = await cancelReservation({
      cognitoSub: 'sub-1',
      reservationId: 'res-1',
      client,
      now: farEnoughNow,
    });

    expect(result).toEqual({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
  });
});
