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
    Key?: { PK?: string; SK?: string };
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
  /** Socios existentes por memberId (lecturas `MEMBER#<id>` / `PROFILE`). */
  members?: Record<string, Record<string, unknown>>;
}) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'GetCommand') {
      const pk = cmd.input.Key?.PK ?? '';
      if (pk.startsWith('MEMBER#')) {
        const found = options.members?.[pk.slice('MEMBER#'.length)];
        return found ? { Item: found } : {};
      }
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

describe('nombres de los participantes (US-080)', () => {
  const profile = (memberId: string, firstName: string, lastName: string) => ({
    entityType: 'Member',
    memberId,
    firstName,
    lastName,
    dni: '12345678',
    email: `${memberId}@club.pe`,
    phone: '999999999',
  });
  const participant = (
    participantId: string,
    participantType: string,
    memberId: string | null,
    extra: Record<string, unknown> = {},
  ) => ({ ...holderParticipantRaw, participantId, participantType, memberId, ...extra });
  const asAdmin = (client: ReturnType<typeof buildClient>) =>
    getReservationDetail({
      cognitoSub: 'admin-sub',
      roles: ['admin'],
      reservationId: 'res-1',
      client,
    });
  const memberGets = (client: ReturnType<typeof buildClient>) =>
    (client.send.mock.calls as [CommandLike][]).filter(
      ([c]) => c.constructor.name === 'GetCommand' && c.input.Key?.PK?.startsWith('MEMBER#'),
    );

  it('resuelve HOLDER y MEMBER con nombre, GUEST con null y conserva guestName/guestDni', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      member,
      participants: [
        participant('p1', 'HOLDER', 'member-1'),
        participant('p2', 'MEMBER', 'member-2'),
        participant('p3', 'GUEST', null, { guestName: 'Ana Perez', guestDni: '87654321' }),
      ],
      members: {
        'member-1': profile('member-1', 'Luis', 'Rojas'),
        'member-2': profile('member-2', 'Marta', 'Diaz'),
      },
    });

    const result = await getReservationDetail({
      cognitoSub: 'sub-1',
      roles: ['member'],
      reservationId: 'res-1',
      client,
    });

    expect(result.participants.map((p) => p.member)).toEqual([
      { memberId: 'member-1', firstName: 'Luis', lastName: 'Rojas' },
      { memberId: 'member-2', firstName: 'Marta', lastName: 'Diaz' },
      null,
    ]);
    expect(result.participants[2]).toMatchObject({ guestName: 'Ana Perez', guestDni: '87654321' });
  });

  it('un socio no resoluble devuelve member null y la respuesta sigue siendo válida', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      participants: [participant('p1', 'HOLDER', 'member-1'), participant('p2', 'MEMBER', 'gone')],
      members: { 'member-1': profile('member-1', 'Luis', 'Rojas') },
    });

    const result = await asAdmin(client);

    expect(result.participants[0]?.member?.firstName).toBe('Luis');
    expect(result.participants[1]?.member).toBeNull();
  });

  it('nunca expone DNI, correo ni teléfono en member', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      participants: [participant('p1', 'HOLDER', 'member-1')],
      members: { 'member-1': profile('member-1', 'Luis', 'Rojas') },
    });

    const result = await asAdmin(client);

    expect(Object.keys(result.participants[0]?.member ?? {}).sort()).toEqual([
      'firstName',
      'lastName',
      'memberId',
    ]);
  });

  it('resuelve una sola vez los memberId repetidos', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      participants: [
        participant('p1', 'HOLDER', 'member-1'),
        participant('p2', 'MEMBER', 'member-2'),
        participant('p3', 'MEMBER', 'member-2'),
      ],
      members: {
        'member-1': profile('member-1', 'Luis', 'Rojas'),
        'member-2': profile('member-2', 'Marta', 'Diaz'),
      },
    });

    await asAdmin(client);

    expect(memberGets(client)).toHaveLength(2);
  });

  it('límite de 31 participantes distintos: 31 lecturas por clave y ningún Scan', async () => {
    const ids = Array.from({ length: 31 }, (_, i) => `m-${i}`);
    const members = Object.fromEntries(ids.map((id) => [id, profile(id, `N${id}`, `A${id}`)]));
    const client = buildClient({
      reservation: reservationRaw,
      participants: ids.map((id, i) => participant(`p${i}`, i === 0 ? 'HOLDER' : 'MEMBER', id)),
      members,
    });

    const result = await asAdmin(client);

    const names = (client.send.mock.calls as [CommandLike][]).map(([c]) => c.constructor.name);
    expect(result.participants).toHaveLength(31);
    expect(result.participants.every((p) => p.member !== null)).toBe(true);
    expect(memberGets(client)).toHaveLength(31);
    expect(names).not.toContain('ScanCommand');
  });

  it('sin acompañantes: solo el HOLDER con su nombre', async () => {
    const client = buildClient({
      reservation: reservationRaw,
      member,
      participants: [participant('p1', 'HOLDER', 'member-1')],
      members: { 'member-1': profile('member-1', 'Luis', 'Rojas') },
    });

    const result = await getReservationDetail({
      cognitoSub: 'sub-1',
      roles: ['member'],
      reservationId: 'res-1',
      client,
    });

    expect(result.participants).toHaveLength(1);
    expect(result.participants[0]?.member?.lastName).toBe('Rojas');
  });
});
