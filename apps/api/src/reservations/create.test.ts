import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  CreateReservationRequest,
  Member,
  MembershipStatus,
  MemberStatus,
  Resource,
} from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { createReservation, assertMemberCanReserve, isWithinResourceSchedule } =
  await import('./create');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Item?: Record<string, unknown>;
    TransactItems?: { Put: { Item: Record<string, unknown> } }[];
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

// Primer slot válido de fútbol (mismo valor reproducido en slots.test.ts): 06:00 Lima.
const validFutbolStartsAt = '2026-07-12T11:00:00.000Z';
// Primer slot válido de parrilla: 10:00 Lima.
const validParrillaStartsAt = '2026-07-12T15:00:00.000Z';

function buildRequest(overrides: Partial<CreateReservationRequest> = {}): CreateReservationRequest {
  return {
    resourceId: 'futbol-1',
    startsAt: validFutbolStartsAt,
    participants: [],
    ...overrides,
  };
}

function buildClient(options: {
  member?: Member | undefined;
  resource?: Resource | undefined;
  occupancyItems?: unknown[];
  writeError?: unknown;
}) {
  const calls: string[] = [];
  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const ctor = cmd.constructor.name;

    if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI1') {
      calls.push('member-lookup');
      return { Items: options.member ? [options.member] : [] };
    }
    if (ctor === 'GetCommand') {
      calls.push('resource-get');
      return options.resource ? { Item: options.resource } : {};
    }
    if (ctor === 'QueryCommand' && cmd.input.IndexName === 'GSI3') {
      calls.push('occupancy-query');
      return { Items: options.occupancyItems ?? [] };
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

    const transactCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'TransactWriteCommand',
    )?.[0] as CommandLike;
    const items = transactCall.input.TransactItems ?? [];
    const reservationItem = items.find((item) => item.Put.Item['entityType'] === 'Reservation')?.Put
      .Item;
    const participantItem = items.find(
      (item) => item.Put.Item['entityType'] === 'ReservationParticipant',
    )?.Put.Item;

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

  it('devuelve 409 RESERVATION_OVERLAP si hay una reserva activa solapada (criterio 7)', async () => {
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

  it('devuelve 404 NOT_FOUND si el recurso no existe (criterio 12)', async () => {
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

  it('escribe la reserva y el participante en una única TransactWriteCommand (criterio 13)', async () => {
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

  it('traduce el fallo de concurrencia (candado de franja) a 409 RESERVATION_OVERLAP y no audita (criterio 14)', async () => {
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

  it('deja rastro de auditoría RESERVATION_CREATED con el estado resultante (criterio 16)', async () => {
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

  it('devuelve 422 MEMBERSHIP_REQUIRED sin llegar a resolver el recurso (criterio 10)', async () => {
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

  it('devuelve 422 MEMBER_HAS_DEBT sin llegar a resolver el recurso (criterio 11, P-10)', async () => {
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
});
