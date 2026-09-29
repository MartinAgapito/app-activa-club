import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { getReservationDetail } = await import('./get-by-id');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, unknown>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

function fakeClient(
  send: (command: unknown) => Promise<unknown>,
): DynamoDBDocumentClient & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn(send) } as unknown as DynamoDBDocumentClient & {
    send: ReturnType<typeof vi.fn>;
  };
}

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

const holderParticipantRaw = {
  entityType: 'ReservationParticipant',
  participantId: 'part-1',
  reservationId: 'res-1',
  participantType: 'HOLDER',
  memberId: 'member-1',
  guestDni: null,
  guestName: null,
  startsAt: '2026-07-12T11:00:00.000Z',
  endsAt: '2026-07-12T12:30:00.000Z',
};

const member = {
  memberId: 'member-1',
  cognitoSub: 'sub-1',
};

function buildClient(options: {
  reservation?: Record<string, unknown>;
  member?: Record<string, unknown>;
  participants?: Record<string, unknown>[];
}) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'GetCommand') {
      return options.reservation ? { Item: options.reservation } : {};
    }
    if (cmd.constructor.name === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
      return options.member ? { Items: [options.member] } : { Items: [] };
    }
    if (cmd.constructor.name === 'QueryCommand') {
      return { Items: options.participants ?? [] };
    }
    throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
  });
}

describe('getReservationDetail (US-033, criterios 3/4)', () => {
  it('devuelve la cabecera con sus participantes para el titular (member)', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      member,
      participants: [holderParticipantRaw],
    });

    const result = await getReservationDetail({
      cognitoSub: 'sub-1',
      roles: ['member'],
      reservationId: 'res-1',
      client,
    });

    expect(result.reservationId).toBe('res-1');
    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]?.participantType).toBe('HOLDER');
  });

  it('devuelve NOT_FOUND si la reserva no existe', async () => {
    const client = buildClient({});

    await expect(
      getReservationDetail({
        cognitoSub: 'sub-1',
        roles: ['member'],
        reservationId: 'res-x',
        client,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('devuelve NOT_FOUND (no FORBIDDEN) si el member autenticado no es el titular (criterio 4)', async () => {
    const otherMember = { memberId: 'member-2', cognitoSub: 'sub-2' };
    const client = buildClient({ reservation: reservationRaw, member: otherMember });

    await expect(
      getReservationDetail({
        cognitoSub: 'sub-2',
        roles: ['member'],
        reservationId: 'res-1',
        client,
      }),
    ).rejects.toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('admin puede ver el detalle de cualquier reserva sin restricción de titular', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      participants: [holderParticipantRaw],
    });

    const result = await getReservationDetail({
      cognitoSub: 'admin-sub',
      roles: ['admin'],
      reservationId: 'res-1',
      client,
    });

    expect(result.reservationId).toBe('res-1');
  });
});
