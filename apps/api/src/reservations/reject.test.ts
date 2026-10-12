import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// US-044: el emisor real se prueba en notifications/ y notify.test.ts; aquí se
// verifica qué evento y qué datos pide el orquestador.
vi.mock('../notifications', () => ({ emitNotification: vi.fn() }));

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { rejectReservation } = await import('./reject');
const { emitNotification } = await import('../notifications');
const emitMock = vi.mocked(emitNotification);

interface CommandLike {
  constructor: { name: string };
  input: {
    Key?: Record<string, unknown>;
    TransactItems?: { Update?: { Key: Record<string, unknown>; ConditionExpression?: string } }[];
  };
}

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

const pendingReservationRaw = {
  entityType: 'Reservation',
  reservationId: 'res-parrilla',
  resourceId: 'parrilla-1',
  resourceType: 'PARRILLA',
  holderMemberId: 'member-1',
  startsAt: '2026-07-20T15:00:00.000Z',
  endsAt: '2026-07-20T20:00:00.000Z',
  reservationStatus: 'PENDING_APPROVAL',
  participantCount: 3,
  guestCount: 1,
  requiresApproval: true,
  rejectionReason: null,
  cancelledAt: null,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
};

const guestParticipantRaw = {
  entityType: 'ReservationParticipant',
  participantId: 'part-2',
  reservationId: 'res-parrilla',
  participantType: 'GUEST',
  memberId: null,
  guestDni: '70605040',
  guestName: 'Ana Torres',
  startsAt: '2026-07-20T15:00:00.000Z',
  endsAt: '2026-07-20T20:00:00.000Z',
};

const guestCounterRaw = {
  guestDni: '70605040',
  month: '2026-07',
  visitCount: 1,
  reservationIds: ['res-parrilla'],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const actor = { actorId: 'admin-1', actorRole: 'admin' as const };

interface BuildClientOptions {
  reservation?: Record<string, unknown> | null;
  participants?: Record<string, unknown>[];
  guestCounters?: Record<string, Record<string, unknown> | undefined>;
  writeError?: Error;
}

function buildClient(options: BuildClientOptions) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'GetCommand') {
      const pk = (cmd.input.Key?.['PK'] as string | undefined) ?? '';
      const sk = (cmd.input.Key?.['SK'] as string | undefined) ?? '';
      if (pk.startsWith('RESERVATION#')) {
        return options.reservation ? { Item: options.reservation } : {};
      }
      if (pk.startsWith('RESOURCE#')) {
        // US-044: nombre de la instalación para el aviso.
        return { Item: { resourceId: 'parrilla-1', name: 'Parrilla 1' } };
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

describe('rejectReservation (US-034, criterios 3/4/5/9/10/11)', () => {
  it('criterio 3: rechaza con un motivo y responde REJECTED con rejectionReason persistido', async () => {
    const client = buildClient({ reservation: pendingReservationRaw, participants: [] });

    const result = await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'Recurso en mantenimiento',
      actor,
      client,
    });

    expect(result).toEqual({
      reservationId: 'res-parrilla',
      reservationStatus: 'REJECTED',
      rejectionReason: 'Recurso en mantenimiento',
    });
  });

  it('devuelve NOT_FOUND (404) si la reserva no existe', async () => {
    const client = buildClient({ reservation: null });

    await expect(
      rejectReservation({ reservationId: 'res-x', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('criterio 5: una reserva ya REJECTED devuelve RESERVATION_NOT_PENDING (409) sin escribir nada', async () => {
    const client = buildClient({
      reservation: { ...pendingReservationRaw, reservationStatus: 'REJECTED' },
      participants: [],
    });

    await expect(
      rejectReservation({ reservationId: 'res-parrilla', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });

    const writeCalls = (client.send as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    );
    expect(writeCalls).toHaveLength(0);
  });

  it('caso alternativo: solicitud cancelada por el socio antes de la decisión devuelve RESERVATION_NOT_PENDING', async () => {
    const client = buildClient({
      reservation: { ...pendingReservationRaw, reservationStatus: 'CANCELLED' },
      participants: [],
    });

    await expect(
      rejectReservation({ reservationId: 'res-parrilla', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
  });

  it('criterio 10 (RN-RES-05, R-29): decrementa el contador mensual de cada invitado externo de la reserva', async () => {
    const client = buildClient({
      reservation: pendingReservationRaw,
      participants: [guestParticipantRaw],
      guestCounters: { '70605040': guestCounterRaw },
    });

    await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'Recurso en mantenimiento',
      actor,
      client,
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
      reservation: pendingReservationRaw,
      participants: [guestParticipantRaw],
      guestCounters: {},
    });

    await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'Recurso en mantenimiento',
      actor,
      client,
    });

    const transactCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    expect(transactCall.input.TransactItems).toHaveLength(1);
  });

  it('criterio 11: deja auditoría RESERVATION_REJECTED con el motivo en la metadata', async () => {
    const client = buildClient({ reservation: pendingReservationRaw, participants: [] });

    await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'Recurso en mantenimiento',
      actor,
      client,
    });

    const auditCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'PutCommand',
    )?.[0] as { input: { Item: Record<string, unknown> } };
    expect(auditCall.input.Item['action']).toBe('RESERVATION_REJECTED');
    expect(auditCall.input.Item['actorId']).toBe('admin-1');
    expect(auditCall.input.Item['metadata']).toEqual({
      resourceId: 'parrilla-1',
      reason: 'Recurso en mantenimiento',
    });
  });

  it('traduce NOT_PENDING (carrera en la condición de la transacción, dos admins a la vez) a RESERVATION_NOT_PENDING', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const client = buildClient({
      reservation: pendingReservationRaw,
      participants: [],
      writeError: conditionalError,
    });

    await expect(
      rejectReservation({ reservationId: 'res-parrilla', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
  });
});

describe('rejectReservation - aviso al titular (US-044, criterios 3/6/8/9)', () => {
  beforeEach(() => {
    emitMock.mockReset();
    emitMock.mockResolvedValue({ inbox: 'WRITTEN', email: 'SENT', notificationId: 'n-1' });
  });

  it('emite RESERVATION_REJECTED al titular con el motivo registrado', async () => {
    const client = buildClient({ reservation: pendingReservationRaw, participants: [] });

    await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'Recurso en mantenimiento',
      actor,
      client,
    });

    expect(emitMock).toHaveBeenCalledTimes(1);
    const input = emitMock.mock.calls[0]?.[0];
    expect(input).toMatchObject({
      event: 'RESERVATION_REJECTED',
      entityId: 'res-parrilla',
      memberId: 'member-1',
      data: {
        resourceName: 'Parrilla 1',
        startsAt: pendingReservationRaw.startsAt,
        endsAt: pendingReservationRaw.endsAt,
        reason: 'Recurso en mantenimiento',
      },
    });
    // Criterio 8: ni participantes ni administrador en el aviso.
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain('Ana Torres');
    expect(serialized).not.toContain('70605040');
    expect(serialized).not.toContain('admin-1');
  });

  it('criterio 6: una reserva no pendiente (409) no emite', async () => {
    const client = buildClient({
      reservation: { ...pendingReservationRaw, reservationStatus: 'APPROVED' },
      participants: [],
    });

    await expect(
      rejectReservation({ reservationId: 'res-parrilla', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('el administrador que pierde la carrera (409) no emite', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
    });
    const client = buildClient({
      reservation: pendingReservationRaw,
      participants: [],
      writeError: conditionalError,
    });

    await expect(
      rejectReservation({ reservationId: 'res-parrilla', reason: 'motivo', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('criterio 9: un emisor que rechaza no altera la respuesta', async () => {
    emitMock.mockRejectedValueOnce(new Error('SES caído'));
    const client = buildClient({ reservation: pendingReservationRaw, participants: [] });

    const result = await rejectReservation({
      reservationId: 'res-parrilla',
      reason: 'motivo',
      actor,
      client,
    });

    expect(result).toEqual({
      reservationId: 'res-parrilla',
      reservationStatus: 'REJECTED',
      rejectionReason: 'motivo',
    });
  });
});
