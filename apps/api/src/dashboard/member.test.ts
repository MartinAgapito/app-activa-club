import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { getMemberDashboard, computeDaysRemaining } = await import('./member');
const { assertMemberCanReserve } = await import('../reservations/create');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    FilterExpression?: string;
    ScanIndexForward?: boolean;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

// 2026-07-10 10:00 en Lima (UTC-5).
const NOW = new Date('2026-07-10T15:00:00.000Z');

const baseMember = {
  memberId: 'member-1',
  legacyId: null,
  dni: '45678912',
  email: 'maria@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: '999888777',
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-1',
  rejectionReason: null,
  membershipType: 'ANNUAL',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00.000Z',
  membershipEndsAt: '2026-12-31T05:00:00.000Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const reservationRaw = (id: string, startsAt: string, status = 'CONFIRMED') => ({
  entityType: 'Reservation',
  reservationId: id,
  resourceId: 'futbol-1',
  resourceType: 'FUTBOL',
  holderMemberId: 'member-1',
  startsAt,
  endsAt: startsAt,
  reservationStatus: status,
  participantCount: 3,
  guestCount: 1,
  requiresApproval: false,
  rejectionReason: null,
  cancelledAt: null,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
});

const notificationRaw = (id: string, readStatus = 'UNREAD') => ({
  PK: 'MEMBER#member-1',
  SK: `NOTIF#2026-07-01T10:00:00.000Z#${id}`,
  notificationId: id,
  title: `Aviso ${id}`,
  body: 'cuerpo privado',
  event: 'PAYMENT_SUCCEEDED',
  readStatus,
  createdAt: '2026-07-01T10:00:00.000Z',
  readAt: null,
});

function buildClient(options: {
  member?: Record<string, unknown> | null;
  reservations?: unknown[];
  notifications?: unknown[];
}) {
  const send = vi.fn(async (command: unknown) => {
    const cmd = command as CommandLike;
    const values = cmd.input.ExpressionAttributeValues ?? {};
    if (cmd.input.IndexName === 'GSI1' && String(values[':pk']).startsWith('COGNITO#')) {
      return { Items: options.member === null ? [] : [options.member ?? baseMember] };
    }
    if (cmd.input.IndexName === 'GSI1') return { Items: options.reservations ?? [] };
    return { Items: options.notifications ?? [] };
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

describe('getMemberDashboard (US-055)', () => {
  it('criterio 1 y 8: nombre de pila y estado; sin datos sensibles ni de otros socios', async () => {
    const client = buildClient({});
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.member).toEqual({ firstName: 'María', memberStatus: 'ACTIVE' });
    const json = JSON.stringify(result);
    expect(json).not.toContain('45678912');
    expect(json).not.toContain('maria@example.com');
    expect(json).not.toContain('Quispe');
  });

  it('criterio 2: membresía con daysRemaining en días de Lima', async () => {
    const client = buildClient({
      member: {
        ...baseMember,
        membershipStatus: 'ACTIVE',
        membershipEndsAt: '2026-07-16T05:00:00.000Z',
      },
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.membership).toEqual({
      type: 'ANNUAL',
      status: 'EXPIRING_SOON',
      endsAt: '2026-07-16T05:00:00.000Z',
      daysRemaining: 6,
      outstandingBalance: 0,
    });
    expect(result.alerts).toEqual([
      { code: 'RENEWAL_DUE', message: 'Tu membresía vence en 6 días.' },
    ]);
    expect(result.canReserve).toBe(true);
  });

  it('daysRemaining respeta el borde de medianoche de Lima', () => {
    // 2026-07-11T04:59Z aún es 10 de julio en Lima; 05:00Z ya es 11.
    expect(computeDaysRemaining('2026-07-17T05:00:00.000Z', '2026-07-10')).toBe(7);
    expect(computeDaysRemaining('2026-07-11T04:59:00.000Z', '2026-07-10')).toBe(0);
    expect(computeDaysRemaining('2026-07-09T05:00:00.000Z', '2026-07-10')).toBeNull();
    expect(computeDaysRemaining(null, '2026-07-10')).toBeNull();
    expect(computeDaysRemaining('2026-07-12', '2026-07-10')).toBe(2);
  });

  it('membresía vencida por fecha sin proceso diario: EXPIRED, alerta y canReserve=false', async () => {
    const client = buildClient({
      member: {
        ...baseMember,
        membershipStatus: 'ACTIVE',
        membershipEndsAt: '2026-07-09T05:00:00.000Z',
      },
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.membership.status).toBe('EXPIRED');
    expect(result.membership.daysRemaining).toBeNull();
    expect(result.alerts.map((a) => a.code)).toEqual(['MEMBERSHIP_EXPIRED']);
    expect(result.canReserve).toBe(false);
  });

  it('deuda: alerta PAYMENT_DEBT y canReserve=false', async () => {
    const client = buildClient({
      member: { ...baseMember, membershipStatus: 'DEBT', outstandingBalance: 120 },
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.membership.outstandingBalance).toBe(120);
    expect(result.alerts.map((a) => a.code)).toEqual(['PAYMENT_DEBT']);
    expect(result.canReserve).toBe(false);
  });

  it('socio al día: sin alertas', async () => {
    const result = await getMemberDashboard({
      cognitoSub: 'sub-1',
      client: buildClient({}),
      now: NOW,
    });
    expect(result.alerts).toEqual([]);
  });

  it('socio no ACTIVE recibe su resumen con canReserve=false', async () => {
    const client = buildClient({
      member: {
        ...baseMember,
        memberStatus: 'APPROVED',
        membershipType: null,
        membershipStatus: 'NONE',
        membershipEndsAt: null,
      },
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.canReserve).toBe(false);
    expect(result.membership).toMatchObject({ type: null, endsAt: null, daysRemaining: null });
  });

  it('criterio 3: canReserve coincide con assertMemberCanReserve en cada escenario', async () => {
    const scenarios = [
      baseMember,
      { ...baseMember, membershipStatus: 'DEBT', outstandingBalance: 10 },
      { ...baseMember, membershipStatus: 'EXPIRED' },
      { ...baseMember, membershipEndsAt: '2026-07-09T05:00:00.000Z' },
      {
        ...baseMember,
        membershipStatus: 'EXPIRING_SOON',
        membershipEndsAt: '2026-07-12T05:00:00.000Z',
      },
      { ...baseMember, memberStatus: 'PENDING' },
      { ...baseMember, outstandingBalance: 1 },
    ];
    for (const scenario of scenarios) {
      const result = await getMemberDashboard({
        cognitoSub: 'sub-1',
        client: buildClient({ member: scenario }),
        now: NOW,
      });
      let allowed = true;
      try {
        assertMemberCanReserve(scenario as never, NOW);
      } catch {
        allowed = false;
      }
      expect(result.canReserve).toBe(allowed);
    }
  });

  it('criterio 5: próximas reservas como titular, por GSI1 y solo estados activos', async () => {
    const client = buildClient({
      reservations: [
        reservationRaw('r0', '2026-07-10T15:00:00.000Z'), // empieza ahora: no es próxima
        reservationRaw('r1', '2026-07-11T15:00:00.000Z', 'PENDING_APPROVAL'),
        reservationRaw('r2', '2026-07-12T15:00:00.000Z'),
      ],
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.upcomingReservations).toEqual([
      {
        reservationId: 'r1',
        resourceType: 'FUTBOL',
        startsAt: '2026-07-11T15:00:00.000Z',
        reservationStatus: 'PENDING_APPROVAL',
      },
      {
        reservationId: 'r2',
        resourceType: 'FUTBOL',
        startsAt: '2026-07-12T15:00:00.000Z',
        reservationStatus: 'CONFIRMED',
      },
    ]);

    const reservationQuery = client.send.mock.calls
      .map((call) => call[0] as CommandLike)
      .find(
        (cmd) =>
          cmd.input.IndexName === 'GSI1' &&
          String(cmd.input.ExpressionAttributeValues?.[':pk']).startsWith('MEMBER#'),
      );
    expect(reservationQuery?.input.ExpressionAttributeValues).toMatchObject({
      ':pk': 'MEMBER#member-1',
      ':from': 'RES#2026-07-10T15:00:00.000Z',
    });
    expect(reservationQuery?.input.ScanIndexForward).toBe(true);
    expect(reservationQuery?.input.FilterExpression).toContain('reservationStatus IN');
  });

  it('criterio 5: con 7 reservas futuras devuelve 5', async () => {
    const reservations = Array.from({ length: 7 }, (_, i) =>
      reservationRaw(`r${i}`, `2026-07-1${i + 1}T15:00:00.000Z`),
    );
    const result = await getMemberDashboard({
      cognitoSub: 'sub-1',
      client: buildClient({ reservations }),
      now: NOW,
    });
    expect(result.upcomingReservations.map((r) => r.reservationId)).toEqual([
      'r0',
      'r1',
      'r2',
      'r3',
      'r4',
    ]);
  });

  it('criterio 6: avisos recientes con estado de lectura, sin cuerpo', async () => {
    const client = buildClient({
      notifications: [notificationRaw('n2'), notificationRaw('n1', 'READ')],
    });
    const result = await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });

    expect(result.recentNotifications).toEqual([
      { notificationId: 'n2', title: 'Aviso n2', readStatus: 'UNREAD' },
      { notificationId: 'n1', title: 'Aviso n1', readStatus: 'READ' },
    ]);
  });

  it('criterio 7: sin reservas ni avisos, listas vacías', async () => {
    const result = await getMemberDashboard({
      cognitoSub: 'sub-1',
      client: buildClient({}),
      now: NOW,
    });
    expect(result.upcomingReservations).toEqual([]);
    expect(result.recentNotifications).toEqual([]);
  });

  it('NOT_FOUND si el token no corresponde a ningún socio', async () => {
    await expect(
      getMemberDashboard({
        cognitoSub: 'sub-x',
        client: buildClient({ member: null }),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('solo lecturas: nunca emite comandos de escritura ni Scan', async () => {
    const client = buildClient({});
    await getMemberDashboard({ cognitoSub: 'sub-1', client, now: NOW });
    const names = client.send.mock.calls.map((call) => (call[0] as CommandLike).constructor.name);
    expect(new Set(names)).toEqual(new Set(['QueryCommand']));
  });
});
