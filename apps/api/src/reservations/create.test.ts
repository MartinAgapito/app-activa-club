import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CreateReservationRequest,
  Member,
  MembershipStatus,
  MemberStatus,
  Resource,
  ReservationParticipantInput,
} from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const {
  createReservation,
  assertMemberCanReserve,
  assertNoDuplicateParticipants,
  isWithinResourceSchedule,
} = await import('./create');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Item?: Record<string, unknown>;
    Key?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    TransactItems?: {
      Put?: { Item: Record<string, unknown> };
      Update?: { Key: Record<string, unknown>; UpdateExpression: string };
    }[];
  };
}

const baseMember: Member = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: null,
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-1',
  rejectionReason: null,
  membershipType: 'MONTHLY',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00.000Z',
  membershipEndsAt: '2026-12-31T00:00:00.000Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const accompanyingMember: Member = {
  ...baseMember,
  memberId: 'member-2',
  dni: '11223344',
  firstName: 'Carlos',
  lastName: 'Ríos',
  cognitoSub: 'sub-2',
};

const futbol1: Resource = {
  resourceId: 'futbol-1',
  type: 'FUTBOL',
  name: 'Cancha de fútbol 1',
  capacity: 14,
  blockMinutes: 90,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

const parrilla1: Resource = {
  resourceId: 'parrilla-1',
  type: 'PARRILLA',
  name: 'Parrilla 1',
  capacity: 12,
  blockMinutes: 300,
  opensAt: '10:00',
  closesAt: '22:00',
  requiresApproval: true,
  resourceStatus: 'AVAILABLE',
};

const piscina1: Resource = {
  resourceId: 'piscina-1',
  type: 'PISCINA',
  name: 'Piscina',
  capacity: 5, // titular + 4 invitados (criterio 8, US-031)
  blockMinutes: 60,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

// Primer slot válido de fútbol/piscina (mismo valor reproducido en slots.test.ts): 06:00 Lima.
const validFutbolStartsAt = '2026-07-12T11:00:00.000Z';
// Primer slot válido de parrilla: 10:00 Lima.
const validParrillaStartsAt = '2026-07-12T15:00:00.000Z';
// Mes calendario de Lima de validFutbolStartsAt (guest-month.ts): 06:00 Lima del 12/07 -> julio.
const guestMonth = '2026-07';

function buildRequest(overrides: Partial<CreateReservationRequest> = {}): CreateReservationRequest {
  return {
    resourceId: 'futbol-1',
    startsAt: validFutbolStartsAt,
    participants: [],
    ...overrides,
  };
}

interface GuestProfileFixture {
  guestDni: string;
  firstName: string;
  lastName: string;
}

interface BuildClientOptions {
  member?: Member | undefined;
  resource?: Resource | undefined;
  occupancyItems?: unknown[];
  writeError?: unknown;
  /** memberId -> Member resuelto por GetItem (participantes MEMBER, US-031). */
  participantMembers?: Record<string, Member | undefined>;
  /** dni -> GuestProfile existente (GetItem GUEST#<dni>/PROFILE, US-031). */
  guestProfiles?: Record<string, GuestProfileFixture | undefined>;
  /** dni -> contador mensual existente (GetItem GUEST#<dni>/MONTH#<mes>, US-031). */
  guestCounters?: Record<string, { visitCount: number } | undefined>;
  /** subjectKey (sin el prefijo "SUBJECT#") -> ítems ReservationParticipant crudos hallados en GSI1 (US-031). */
  subjectOverlapItems?: Record<string, unknown[]>;
  /** reservationId -> Reservation madre cruda, para resolver reservationStatus en el chequeo de superposición (US-031). */
  reservationsById?: Record<string, unknown>;
}

function buildClient(options: BuildClientOptions) {
  const calls: string[] = [];
  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const ctor = cmd.constructor.name;

    if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
      const pk = (cmd.input.ExpressionAttributeValues as Record<string, string> | undefined)?.[
        ':pk'
      ];
      if (pk?.startsWith('COGNITO#')) {
        calls.push('member-lookup');
        return { Items: options.member ? [options.member] : [] };
      }
      if (pk?.startsWith('SUBJECT#')) {
        calls.push('subject-overlap-query');
        const subjectKey = pk.slice('SUBJECT#'.length);
        return { Items: options.subjectOverlapItems?.[subjectKey] ?? [] };
      }
      throw new Error(`Query GSI1 inesperada en la prueba: pk=${pk}`);
    }
    if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI3') {
      calls.push('occupancy-query');
      return { Items: options.occupancyItems ?? [] };
    }
    if (ctor === 'GetCommand') {
      const key = cmd.input.Key ?? {};
      const pk = key['PK'] ?? '';
      const sk = key['SK'] ?? '';
      if (pk.startsWith('RESOURCE#')) {
        calls.push('resource-get');
        return options.resource ? { Item: options.resource } : {};
      }
      if (pk.startsWith('MEMBER#')) {
        calls.push('participant-member-get');
        const memberId = pk.slice('MEMBER#'.length);
        const member = options.participantMembers?.[memberId];
        return member ? { Item: member } : {};
      }
      if (pk.startsWith('RESERVATION#')) {
        calls.push('reservation-get');
        const reservationId = pk.slice('RESERVATION#'.length);
        const reservation = options.reservationsById?.[reservationId];
        return reservation ? { Item: reservation } : {};
      }
      if (pk.startsWith('GUEST#') && sk === 'PROFILE') {
        calls.push('guest-profile-get');
        const dni = pk.slice('GUEST#'.length);
        const profile = options.guestProfiles?.[dni];
        return profile ? { Item: profile } : {};
      }
      if (pk.startsWith('GUEST#') && sk.startsWith('MONTH#')) {
        calls.push('guest-counter-get');
        const dni = pk.slice('GUEST#'.length);
        const counter = options.guestCounters?.[dni];
        return counter ? { Item: counter } : {};
      }
      throw new Error(`GetCommand inesperado en la prueba: PK=${pk} SK=${sk}`);
    }
    if (ctor === 'TransactWriteCommand') {
      calls.push('write-transaction');
      if (options.writeError) throw options.writeError;
      return {};
    }
    if (ctor === 'PutCommand') {
      calls.push('audit-put');
      return {};
    }
    throw new Error(`Comando inesperado en la prueba: ${ctor}`);
  });
  return {
    client: { send } as unknown as DynamoDBDocumentClient & { send: typeof send },
    calls,
  };
}

function transactItemsOf(client: { send: ReturnType<typeof vi.fn> }) {
  const call = client.send.mock.calls.find(
    ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
  )?.[0] as CommandLike;
  return call.input.TransactItems ?? [];
}

const activeReservationOverlapping = {
  entityType: 'Reservation',
  reservationId: 'res-existing',
  resourceId: 'futbol-1',
  resourceType: 'FUTBOL',
  holderMemberId: 'member-2',
  startsAt: validFutbolStartsAt,
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

const maintenanceBlockOverlapping = {
  entityType: 'MaintenanceBlock',
  blockId: 'block-1',
  resourceId: 'futbol-1',
  startsAt: validFutbolStartsAt,
  endsAt: '2026-07-12T12:30:00.000Z',
  reason: 'Riego',
  createdBy: 'admin-1',
  createdAt: '2026-07-09T00:00:00.000Z',
};

/** Ítem `ReservationParticipant` crudo, tal como lo devolvería una Query GSI1 SUBJECT#. */
function subjectOverlapParticipant(overrides: Record<string, unknown> = {}) {
  return {
    entityType: 'ReservationParticipant',
    participantId: 'part-other',
    reservationId: 'res-other',
    participantType: 'MEMBER',
    memberId: 'member-2',
    guestDni: null,
    guestName: null,
    startsAt: validFutbolStartsAt,
    endsAt: '2026-07-12T12:30:00.000Z',
    ...overrides,
  };
}

function otherActiveReservation(overrides: Record<string, unknown> = {}) {
  return { ...activeReservationOverlapping, reservationId: 'res-other', ...overrides };
}

describe('assertMemberCanReserve', () => {
  it.each<MemberStatus>(['MIGRATED', 'PENDING', 'APPROVED', 'REJECTED'])(
    'rechaza MEMBERSHIP_REQUIRED si memberStatus es %s (criterio 10)',
    (memberStatus) => {
      expect(() => assertMemberCanReserve({ ...baseMember, memberStatus })).toThrowError(
        expect.objectContaining({ code: 'MEMBERSHIP_REQUIRED' }),
      );
    },
  );

  it.each<MembershipStatus>(['DEBT', 'EXPIRED'])(
    'rechaza MEMBER_HAS_DEBT si membershipStatus es %s (criterio 11)',
    (membershipStatus) => {
      expect(() => assertMemberCanReserve({ ...baseMember, membershipStatus })).toThrowError(
        expect.objectContaining({ code: 'MEMBER_HAS_DEBT' }),
      );
    },
  );

  it('rechaza MEMBER_HAS_DEBT si outstandingBalance > 0 (criterio 11, P-10)', () => {
    expect(() => assertMemberCanReserve({ ...baseMember, outstandingBalance: 5000 })).toThrowError(
      expect.objectContaining({ code: 'MEMBER_HAS_DEBT' }),
    );
  });

  it('acepta un socio ACTIVE sin deuda ni membresía vencida', () => {
    expect(() => assertMemberCanReserve(baseMember)).not.toThrow();
  });
});

describe('assertNoDuplicateParticipants (US-031, criterio 9)', () => {
  it('acepta una lista sin repetidos, mezclando MEMBER y GUEST', () => {
    const participants: ReservationParticipantInput[] = [
      { type: 'MEMBER', memberId: 'member-2' },
      { type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' },
    ];
    expect(() => assertNoDuplicateParticipants(participants)).not.toThrow();
  });

  it('rechaza VALIDATION_ERROR si el mismo memberId aparece dos veces', () => {
    const participants: ReservationParticipantInput[] = [
      { type: 'MEMBER', memberId: 'member-2' },
      { type: 'MEMBER', memberId: 'member-2' },
    ];
    expect(() => assertNoDuplicateParticipants(participants)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('rechaza VALIDATION_ERROR si el mismo dni de invitado aparece dos veces', () => {
    const participants: ReservationParticipantInput[] = [
      { type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' },
      { type: 'GUEST', dni: '70605040', firstName: 'Ana Maria', lastName: 'Torres' },
    ];
    expect(() => assertNoDuplicateParticipants(participants)).toThrowError(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });
});

describe('isWithinResourceSchedule', () => {
  const schedule = { opensAt: '06:00', closesAt: '22:00', blockMinutes: 90 };
  const now = new Date('2026-07-01T00:00:00.000Z');

  it('acepta el primer slot exacto del recurso', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: validFutbolStartsAt,
        endsAt: '2026-07-12T12:30:00.000Z',
        ...schedule,
        now,
      }),
    ).toBe(true);
  });

  it('rechaza un startsAt que no coincide con el inicio de una franja (criterio 5)', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: '2026-07-12T11:15:00.000Z',
        endsAt: '2026-07-12T12:45:00.000Z',
        ...schedule,
        now,
      }),
    ).toBe(false);
  });

  it('rechaza un startsAt alineado pero antes de opensAt (criterio 6)', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: '2026-07-12T09:30:00.000Z', // 04:30 Lima, alineado pero antes de 06:00
        endsAt: '2026-07-12T11:00:00.000Z',
        ...schedule,
        now,
      }),
    ).toBe(false);
  });

  it('rechaza una franja que cruza el cierre del recurso (caso alternativo)', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: '2026-07-13T01:00:00.000Z', // 20:00 Lima del 12/07: parrilla 300min excede closesAt
        endsAt: '2026-07-13T06:00:00.000Z',
        opensAt: '10:00',
        closesAt: '22:00',
        blockMinutes: 300,
        now,
      }),
    ).toBe(false);
  });

  it('rechaza una franja en el pasado (caso alternativo)', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: validFutbolStartsAt,
        endsAt: '2026-07-12T12:30:00.000Z',
        ...schedule,
        now: new Date('2026-07-12T11:30:00.000Z'),
      }),
    ).toBe(false);
  });

  it('rechaza una franja para el mismo instante que "ahora" (caso alternativo, borde estricto)', () => {
    expect(
      isWithinResourceSchedule({
        startsAt: validFutbolStartsAt,
        endsAt: '2026-07-12T12:30:00.000Z',
        ...schedule,
        now: new Date(validFutbolStartsAt),
      }),
    ).toBe(false);
  });
});

describe('createReservation', () => {
  it('crea la reserva y responde con los 6 campos del contrato (criterio 1)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest(),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
      reservationId: 'res-new',
      holderParticipantId: 'part-new',
    });

    expect(result).toEqual({
      reservationId: 'res-new',
      resourceId: 'futbol-1',
      reservationStatus: 'CONFIRMED',
      startsAt: validFutbolStartsAt,
      endsAt: '2026-07-12T12:30:00.000Z',
      participantCount: 1,
      guestCount: 0,
    });
  });

  it('FUTBOL/TENIS/PADEL/PISCINA confirman de inmediato (criterio 2, RN-RES-01)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest(),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.reservationStatus).toBe('CONFIRMED');
  });

  it('PARRILLA/SALON_SOCIAL quedan PENDING_APPROVAL y no se confirman solas (criterio 3, RN-RES-02)', async () => {
    const { client } = buildClient({ member: baseMember, resource: parrilla1, occupancyItems: [] });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({ resourceId: 'parrilla-1', startsAt: validParrillaStartsAt }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.reservationStatus).toBe('PENDING_APPROVAL');
  });

  it('registra al socio autenticado como titular y participante HOLDER (criterio 4, RN-RES-06)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest(),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const items = transactItemsOf(client);
    const reservationItem = items.find((item) => item.Put?.Item['entityType'] === 'Reservation')
      ?.Put?.Item;
    const participantItem = items.find(
      (item) => item.Put?.Item['entityType'] === 'ReservationParticipant',
    )?.Put?.Item;

    expect(reservationItem?.['holderMemberId']).toBe('member-1');
    expect(participantItem?.['participantType']).toBe('HOLDER');
    expect(participantItem?.['memberId']).toBe('member-1');
  });

  it('devuelve 422 OUTSIDE_SCHEDULE si el startsAt no coincide con una franja válida (criterio 5)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ startsAt: '2026-07-12T11:15:00.000Z' }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_SCHEDULE' });
  });

  it('devuelve 422 OUTSIDE_SCHEDULE fuera del horario del recurso (criterio 6)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ startsAt: '2026-07-12T09:30:00.000Z' }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_SCHEDULE' });
  });

  it('devuelve 422 OUTSIDE_SCHEDULE para una franja que cruza el cierre del recurso (caso alternativo)', async () => {
    const { client } = buildClient({ member: baseMember, resource: parrilla1, occupancyItems: [] });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ resourceId: 'parrilla-1', startsAt: '2026-07-13T01:00:00.000Z' }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_SCHEDULE' });
  });

  it('devuelve 422 OUTSIDE_SCHEDULE para una franja ya iniciada o en el pasado (caso alternativo)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date(validFutbolStartsAt),
      }),
    ).rejects.toMatchObject({ code: 'OUTSIDE_SCHEDULE' });
  });

  it('devuelve 409 RESERVATION_OVERLAP si hay una reserva activa solapada (criterio 7 de US-030)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [activeReservationOverlapping],
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESERVATION_OVERLAP' });
  });

  it('devuelve 422 CAPACITY_EXCEEDED si el aforo del recurso es 0 (criterio 8)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: { ...futbol1, capacity: 0 },
      occupancyItems: [],
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' });
  });

  it('devuelve 409 RESOURCE_IN_MAINTENANCE si el recurso completo está en mantenimiento, sin consultar cruces (criterio 9)', async () => {
    const { client, calls } = buildClient({
      member: baseMember,
      resource: { ...futbol1, resourceStatus: 'MAINTENANCE' },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_IN_MAINTENANCE' });
    expect(calls).not.toContain('occupancy-query');
  });

  it('devuelve 409 RESOURCE_IN_MAINTENANCE si la franja se solapa con un bloqueo puntual (criterio 9)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [maintenanceBlockOverlapping],
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_IN_MAINTENANCE' });
  });

  it('el mantenimiento tiene precedencia sobre una reserva previa en la misma franja (criterio 9)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [activeReservationOverlapping, maintenanceBlockOverlapping],
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_IN_MAINTENANCE' });
  });

  it('devuelve 404 NOT_FOUND si el recurso no existe (criterio 12 de US-030)', async () => {
    const { client } = buildClient({ member: baseMember, resource: undefined });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ resourceId: 'no-existe' }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('escribe la reserva y el participante en una única TransactWriteCommand (criterio 13 de US-030)', async () => {
    const { client, calls } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
    });

    await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest(),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(calls.filter((call) => call === 'write-transaction')).toHaveLength(1);
  });

  it('traduce el fallo de concurrencia (candado de franja) a 409 RESERVATION_OVERLAP y no audita (criterio 14 de US-030)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
    });
    const { client, calls } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      writeError: conditionalError,
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'RESERVATION_OVERLAP' });
    expect(calls).not.toContain('audit-put');
  });

  it('deja rastro de auditoría RESERVATION_CREATED con el estado resultante (criterio 16 de US-030)', async () => {
    const { client } = buildClient({ member: baseMember, resource: futbol1, occupancyItems: [] });

    await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest(),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
      reservationId: 'res-new',
    });

    const auditCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'PutCommand',
    )?.[0] as CommandLike;

    expect(auditCall.input.Item?.['action']).toBe('RESERVATION_CREATED');
    expect(auditCall.input.Item?.['targetType']).toBe('Reservation');
    expect(auditCall.input.Item?.['targetId']).toBe('res-new');
    expect(
      (auditCall.input.Item?.['metadata'] as Record<string, unknown>)['reservationStatus'],
    ).toBe('CONFIRMED');
  });

  it('devuelve 404 NOT_FOUND (defensivo) si el token no resuelve a ningún socio', async () => {
    const { client } = buildClient({ member: undefined, resource: futbol1 });

    await expect(
      createReservation({
        cognitoSub: 'sub-inexistente',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('devuelve 422 MEMBERSHIP_REQUIRED sin llegar a resolver el recurso (criterio 10 de US-030)', async () => {
    const { client, calls } = buildClient({
      member: { ...baseMember, memberStatus: 'PENDING' },
      resource: futbol1,
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_REQUIRED' });
    expect(calls).not.toContain('resource-get');
  });

  it('devuelve 422 MEMBER_HAS_DEBT sin llegar a resolver el recurso (criterio 11 de US-030, P-10)', async () => {
    const { client, calls } = buildClient({
      member: { ...baseMember, membershipStatus: 'DEBT' },
      resource: futbol1,
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'MEMBER_HAS_DEBT' });
    expect(calls).not.toContain('resource-get');
  });

  // --- US-031: participantes socios e invitados externos --------------------

  it('crea la reserva con participantes MEMBER y GUEST, con participantCount/guestCount coherentes (criterio 1)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      participantMembers: { 'member-2': accompanyingMember },
      guestProfiles: {},
    });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({
        participants: [
          { type: 'MEMBER', memberId: 'member-2' },
          { type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' },
        ],
      }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
      reservationId: 'res-new',
    });

    expect(result.participantCount).toBe(3); // titular + socio + invitado
    expect(result.guestCount).toBe(1);

    const items = transactItemsOf(client);
    const participantItems = items.filter(
      (item) => item.Put?.Item['entityType'] === 'ReservationParticipant',
    );
    expect(participantItems).toHaveLength(3);
  });

  it('devuelve 409 PARTICIPANT_OVERLAP si un participante MEMBER ya está en otra reserva activa superpuesta (criterio 2)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      participantMembers: { 'member-2': accompanyingMember },
      subjectOverlapItems: {
        'MEMBER#member-2': [subjectOverlapParticipant()],
      },
      reservationsById: { 'res-other': otherActiveReservation() },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ participants: [{ type: 'MEMBER', memberId: 'member-2' }] }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_OVERLAP' });
  });

  it('devuelve 409 PARTICIPANT_OVERLAP si el propio titular ya tiene una reserva activa superpuesta, aunque no envíe participantes (criterio 3)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      subjectOverlapItems: {
        'MEMBER#member-1': [
          subjectOverlapParticipant({ memberId: 'member-1', participantType: 'HOLDER' }),
        ],
      },
      reservationsById: { 'res-other': otherActiveReservation({ holderMemberId: 'member-1' }) },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest(),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_OVERLAP' });
  });

  it('devuelve 409 PARTICIPANT_OVERLAP si un invitado externo ya figura en otra reserva activa superpuesta (criterio 4)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {},
      subjectOverlapItems: {
        'GUEST#70605040': [
          subjectOverlapParticipant({
            participantType: 'GUEST',
            memberId: null,
            guestDni: '70605040',
            guestName: 'Ana Torres',
          }),
        ],
      },
      reservationsById: { 'res-other': otherActiveReservation() },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'PARTICIPANT_OVERLAP' });
  });

  it('no rechaza por superposición si la reserva previa del sujeto ya está CANCELLED', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      participantMembers: { 'member-2': accompanyingMember },
      subjectOverlapItems: { 'MEMBER#member-2': [subjectOverlapParticipant()] },
      reservationsById: {
        'res-other': otherActiveReservation({ reservationStatus: 'CANCELLED' }),
      },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ participants: [{ type: 'MEMBER', memberId: 'member-2' }] }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ reservationStatus: 'CONFIRMED' });
  });

  it('devuelve 429 GUEST_MONTHLY_LIMIT si el invitado ya registró 2 visitas este mes (criterio 5)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {},
      guestCounters: { '70605040': { visitCount: 2 } },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'GUEST_MONTHLY_LIMIT' });
  });

  it('acepta un invitado con solo 1 visita registrada este mes (caso alternativo, "segunda visita se acepta")', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {},
      guestCounters: { '70605040': { visitCount: 1 } },
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ guestCount: 1 });
  });

  it('acepta invitados externos en piscina, incluida en el cómputo de aforo (criterio 7)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: piscina1,
      occupancyItems: [],
      guestProfiles: {},
    });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({
        resourceId: 'piscina-1',
        participants: [
          { type: 'GUEST', dni: '11111111', firstName: 'A', lastName: 'Uno' },
          { type: 'GUEST', dni: '22222222', firstName: 'B', lastName: 'Dos' },
          { type: 'GUEST', dni: '33333333', firstName: 'C', lastName: 'Tres' },
          { type: 'GUEST', dni: '44444444', firstName: 'D', lastName: 'Cuatro' },
        ],
      }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.participantCount).toBe(5); // titular + 4 invitados = capacidad exacta
    expect(result.guestCount).toBe(4);
  });

  it('devuelve 422 CAPACITY_EXCEEDED si un invitado más supera el aforo exacto (criterio 8, borde)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: piscina1,
      occupancyItems: [],
      guestProfiles: {},
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          resourceId: 'piscina-1',
          participants: [
            { type: 'GUEST', dni: '11111111', firstName: 'A', lastName: 'Uno' },
            { type: 'GUEST', dni: '22222222', firstName: 'B', lastName: 'Dos' },
            { type: 'GUEST', dni: '33333333', firstName: 'C', lastName: 'Tres' },
            { type: 'GUEST', dni: '44444444', firstName: 'D', lastName: 'Cuatro' },
            { type: 'GUEST', dni: '55555555', firstName: 'E', lastName: 'Cinco' },
          ],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' });
  });

  it('devuelve 400 VALIDATION_ERROR si hay un memberId repetido, sin ninguna lectura previa (criterio 9)', async () => {
    const { client, calls } = buildClient({ member: baseMember, resource: futbol1 });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          participants: [
            { type: 'MEMBER', memberId: 'member-2' },
            { type: 'MEMBER', memberId: 'member-2' },
          ],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(calls).toEqual([]);
  });

  it('devuelve 404 NOT_FOUND si un participante MEMBER no corresponde a ningún socio resoluble, sin crear nada (criterio 10)', async () => {
    const { client, calls } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      participantMembers: {},
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({ participants: [{ type: 'MEMBER', memberId: 'no-existe' }] }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls).not.toContain('write-transaction');
  });

  it('registra al titular como responsable de los participantes (RN-RES-06, criterio 12): holderMemberId siempre es el socio autenticado', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      participantMembers: { 'member-2': accompanyingMember },
    });

    await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({ participants: [{ type: 'MEMBER', memberId: 'member-2' }] }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const items = transactItemsOf(client);
    const reservationItem = items.find((item) => item.Put?.Item['entityType'] === 'Reservation')
      ?.Put?.Item;
    expect(reservationItem?.['holderMemberId']).toBe('member-1');
  });

  it('un invitado nuevo se crea con nombre y apellido enviados, vía upsert de GuestProfile en la transacción (criterio 16)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {}, // no existía
    });

    await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({
        participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
      }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const items = transactItemsOf(client);
    const guestParticipant = items.find(
      (item) =>
        item.Put?.Item['entityType'] === 'ReservationParticipant' &&
        item.Put.Item['participantType'] === 'GUEST',
    )?.Put?.Item;
    expect(guestParticipant?.['guestName']).toBe('Ana Torres');

    const profileUpsert = items.find((item) => item.Update?.Key['SK'] === 'PROFILE')?.Update;
    expect(profileUpsert?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'PROFILE' });
  });

  it('si el invitado ya tenía perfil con otro nombre, la reserva se crea igual y guestName usa el nombre del perfil, no el enviado (criterio 17)', async () => {
    const { client } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {
        '70605040': { guestDni: '70605040', firstName: 'Ana María', lastName: 'Torres Paz' },
      },
    });

    const result = await createReservation({
      cognitoSub: 'sub-1',
      request: buildRequest({
        participants: [
          { type: 'GUEST', dni: '70605040', firstName: 'Anita', lastName: 'T.' }, // nombre distinto, se descarta
        ],
      }),
      client,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.guestCount).toBe(1);
    const items = transactItemsOf(client);
    const guestParticipant = items.find(
      (item) =>
        item.Put?.Item['entityType'] === 'ReservationParticipant' &&
        item.Put.Item['participantType'] === 'GUEST',
    )?.Put?.Item;
    expect(guestParticipant?.['guestName']).toBe('Ana María Torres Paz');
  });

  it('traduce GUEST_LIMIT_EXCEEDED (carrera de concurrencia en el Update condicional) a 429 GUEST_MONTHLY_LIMIT y no audita (criterio 6/18)', async () => {
    const { client, calls } = buildClient({
      member: baseMember,
      resource: futbol1,
      occupancyItems: [],
      guestProfiles: {},
      guestCounters: { '70605040': { visitCount: 1 } }, // pasa el rechazo "en frío"...
    });
    // ...pero la transacción falla igual (otra reserva concurrente ganó la carrera):
    client.send.mockImplementation(async (command: unknown) => {
      const cmd = command as CommandLike;
      const ctor = cmd.constructor.name;
      if (ctor === 'TransactWriteCommand') {
        calls.push('write-transaction');
        throw Object.assign(new Error('cancelled'), {
          name: 'TransactionCanceledException',
          // lock, reservation, holder, guest participant, guestProfile upsert, guestCounter
          CancellationReasons: [
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'ConditionalCheckFailed' },
          ],
        });
      }
      if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
        const pk = (cmd.input.ExpressionAttributeValues as Record<string, string> | undefined)?.[
          ':pk'
        ];
        if (pk?.startsWith('COGNITO#')) return { Items: [baseMember] };
        return { Items: [] };
      }
      if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI3') return { Items: [] };
      if (ctor === 'GetCommand') {
        const key = cmd.input.Key ?? {};
        if (key['PK']?.startsWith('RESOURCE#')) return { Item: futbol1 };
        if (key['PK']?.startsWith('GUEST#') && key['SK'] === 'PROFILE') return {};
        if (key['PK']?.startsWith('GUEST#') && key['SK']?.startsWith('MONTH#')) {
          return {
            Item: { guestDni: '70605040', month: guestMonth, visitCount: 1, reservationIds: [] },
          };
        }
        return {};
      }
      throw new Error(`Comando inesperado: ${ctor}`);
    });

    await expect(
      createReservation({
        cognitoSub: 'sub-1',
        request: buildRequest({
          participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
        }),
        client,
        now: new Date('2026-07-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'GUEST_MONTHLY_LIMIT' });
    expect(calls).not.toContain('audit-put');
  });
});
