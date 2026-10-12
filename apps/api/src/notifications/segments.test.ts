import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const getResourceByIdMock = vi.fn();
vi.mock('../resources/repository', () => ({ getResourceById: getResourceByIdMock }));
const findResourceOccupancyMock = vi.fn();
vi.mock('../reservations/repository', () => ({ findResourceOccupancy: findResourceOccupancyMock }));

const { resolveSegmentRecipients, matchesSituationSegment, MAX_MEMBER_PAGES, MAX_RECIPIENTS } =
  await import('./segments');
const { AppError } = await import('../lib/errors');

const NOW = '2026-10-12T15:00:00.000Z';

type Command = { constructor: { name: string }; input: Record<string, unknown> };

interface MemberFixture {
  memberId: string;
  email?: string | null;
  firstName?: string;
  memberStatus: string;
  membershipStatus?: string;
  outstandingBalance?: number;
}

function member(
  memberId: string,
  memberStatus: string,
  membershipStatus: string,
  outstandingBalance = 0,
): MemberFixture {
  return {
    memberId,
    email: `${memberId}@example.com`,
    firstName: memberId.toUpperCase(),
    memberStatus,
    membershipStatus,
    outstandingBalance,
  };
}

/** Cliente falso: GSI2 por estado (con páginas de 2) y GetItem por clave. */
function fakeClient(options: {
  byStatus?: Record<string, MemberFixture[]>;
  byId?: Record<string, MemberFixture>;
  pageSize?: number;
}) {
  const pageSize = options.pageSize ?? 100;
  const send = vi.fn(async (raw: unknown) => {
    const command = raw as Command;
    if (command.constructor.name === 'QueryCommand') {
      const pk =
        (command.input['ExpressionAttributeValues'] as Record<string, string>)[':pk'] ?? '';
      const status = pk.replace('MEMBER#STATUS#', '');
      const all = options.byStatus?.[status] ?? [];
      const start = command.input['ExclusiveStartKey']
        ? Number((command.input['ExclusiveStartKey'] as { i: number }).i)
        : 0;
      const slice = all.slice(start, start + pageSize);
      const next = start + pageSize;
      return {
        Items: slice,
        ...(next < all.length ? { LastEvaluatedKey: { i: next } } : {}),
      };
    }
    if (command.constructor.name === 'GetCommand') {
      const key = command.input['Key'] as { PK: string };
      return { Item: options.byId?.[key.PK.replace('MEMBER#', '')] };
    }
    throw new Error(`comando inesperado ${command.constructor.name}`);
  });
  return { send } as unknown as DynamoDBDocumentClient & { send: typeof send };
}

const padron = {
  ACTIVE: [
    member('al-dia', 'ACTIVE', 'ACTIVE'),
    member('por-vencer', 'ACTIVE', 'EXPIRING_SOON'),
    member('moroso', 'ACTIVE', 'DEBT', 5000),
    member('vencido', 'ACTIVE', 'EXPIRED'),
    member('saldo-y-vigente', 'ACTIVE', 'ACTIVE', 1000),
    member('sin-membresia', 'ACTIVE', 'NONE'),
  ],
  APPROVED: [member('aprobado', 'APPROVED', 'NONE')],
  PENDING: [member('pendiente', 'PENDING', 'NONE')],
};

async function ids(segment: Parameters<typeof resolveSegmentRecipients>[1]['segment']) {
  const recipients = await resolveSegmentRecipients(fakeClient({ byStatus: padron }), {
    segment,
    now: NOW,
  });
  return recipients.map((r) => r.memberId).sort();
}

describe('resolveSegmentRecipients - segmentos de situación', () => {
  beforeEach(() => {
    getResourceByIdMock.mockReset();
    findResourceOccupancyMock.mockReset();
  });

  it('ALL: socios ACTIVE y APPROVED, nunca PENDING', async () => {
    expect(await ids('ALL')).toEqual(
      [
        'al-dia',
        'aprobado',
        'moroso',
        'por-vencer',
        'saldo-y-vigente',
        'sin-membresia',
        'vencido',
      ].sort(),
    );
  });

  it('ACTIVE: al día o por vencer y sin deuda', async () => {
    expect(await ids('ACTIVE')).toEqual(['al-dia', 'por-vencer']);
  });

  it('DEBT: membershipStatus DEBT o saldo pendiente', async () => {
    expect(await ids('DEBT')).toEqual(['moroso', 'saldo-y-vigente']);
  });

  it('EXPIRED: solo vencidos', async () => {
    expect(await ids('EXPIRED')).toEqual(['vencido']);
  });

  it('EXPIRING_SOON: solo por vencer', async () => {
    expect(await ids('EXPIRING_SOON')).toEqual(['por-vencer']);
  });

  it('los segmentos de situación solo consultan MEMBER#STATUS#ACTIVE (sin Scan)', async () => {
    const client = fakeClient({ byStatus: padron });
    await resolveSegmentRecipients(client, { segment: 'DEBT', now: NOW });
    const commands = client.send.mock.calls.map((c) => c[0] as Command);
    expect(commands.every((c) => c.constructor.name === 'QueryCommand')).toBe(true);
    expect(commands.every((c) => c.input['IndexName'] === 'GSI2')).toBe(true);
    expect(
      commands.map((c) => (c.input['ExpressionAttributeValues'] as Record<string, string>)[':pk']),
    ).toEqual(['MEMBER#STATUS#ACTIVE']);
  });

  it('segmento sin coincidencias devuelve lista vacía', async () => {
    const recipients = await resolveSegmentRecipients(
      fakeClient({ byStatus: { ACTIVE: [member('a', 'ACTIVE', 'ACTIVE')] } }),
      { segment: 'EXPIRED', now: NOW },
    );
    expect(recipients).toEqual([]);
  });

  it('pagina GSI2 hasta agotar la partición', async () => {
    const many = Array.from({ length: 7 }, (_, i) => member(`m${i}`, 'ACTIVE', 'EXPIRED'));
    const client = fakeClient({ byStatus: { ACTIVE: many }, pageSize: 3 });
    const recipients = await resolveSegmentRecipients(client, { segment: 'EXPIRED', now: NOW });
    expect(recipients).toHaveLength(7);
    expect(client.send).toHaveBeenCalledTimes(3);
  });

  it('proyecta solo los atributos necesarios', async () => {
    const client = fakeClient({ byStatus: padron });
    await resolveSegmentRecipients(client, { segment: 'ACTIVE', now: NOW });
    const command = client.send.mock.calls[0]?.[0] as Command;
    expect(command.input['ProjectionExpression']).toContain('memberId');
    expect(command.input['ProjectionExpression']).not.toContain('dni');
  });

  it('error RECIPIENT_LIMIT_EXCEEDED al superar las páginas permitidas', async () => {
    const huge = Array.from({ length: MAX_MEMBER_PAGES + 1 }, (_, i) =>
      member(`m${i}`, 'ACTIVE', 'ACTIVE'),
    );
    const client = fakeClient({ byStatus: { ACTIVE: huge }, pageSize: 1 });
    await expect(
      resolveSegmentRecipients(client, { segment: 'EXPIRED', now: NOW }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_LIMIT_EXCEEDED' });
  });

  it('error RECIPIENT_LIMIT_EXCEEDED al superar el máximo de destinatarios', async () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) =>
      member(`m${i}`, 'ACTIVE', 'ACTIVE'),
    );
    await expect(
      resolveSegmentRecipients(fakeClient({ byStatus: { ACTIVE: many } }), {
        segment: 'ALL',
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_LIMIT_EXCEEDED' });
  });

  it('exactamente el máximo de destinatarios es válido', async () => {
    const many = Array.from({ length: MAX_RECIPIENTS }, (_, i) =>
      member(`m${i}`, 'ACTIVE', 'ACTIVE'),
    );
    const recipients = await resolveSegmentRecipients(fakeClient({ byStatus: { ACTIVE: many } }), {
      segment: 'ALL',
      now: NOW,
    });
    expect(recipients).toHaveLength(MAX_RECIPIENTS);
  });

  it('un correo vacío o ausente queda como null', async () => {
    const recipients = await resolveSegmentRecipients(
      fakeClient({
        byStatus: {
          ACTIVE: [
            { ...member('a', 'ACTIVE', 'ACTIVE'), email: '' },
            { ...member('b', 'ACTIVE', 'ACTIVE'), email: null },
          ],
        },
      }),
      { segment: 'ALL', now: NOW },
    );
    expect(recipients.map((r) => r.email)).toEqual([null, null]);
  });
});

describe('matchesSituationSegment', () => {
  it('requiere memberStatus ACTIVE', () => {
    expect(matchesSituationSegment('DEBT', member('x', 'APPROVED', 'DEBT') as never)).toBe(false);
  });
});

describe('resolveSegmentRecipients - SINGLE', () => {
  it('devuelve al socio con cuenta digital', async () => {
    const client = fakeClient({ byId: { m1: member('m1', 'ACTIVE', 'ACTIVE') } });
    const recipients = await resolveSegmentRecipients(client, {
      segment: 'SINGLE',
      targetMemberId: 'm1',
      now: NOW,
    });
    expect(recipients).toEqual([{ memberId: 'm1', email: 'm1@example.com', firstName: 'M1' }]);
  });

  it('acepta un socio APPROVED', async () => {
    const client = fakeClient({ byId: { m1: member('m1', 'APPROVED', 'NONE') } });
    const recipients = await resolveSegmentRecipients(client, {
      segment: 'SINGLE',
      targetMemberId: 'm1',
      now: NOW,
    });
    expect(recipients).toHaveLength(1);
  });

  it.each([
    ['inexistente', {}],
    ['sin cuenta digital (PENDING)', { m1: member('m1', 'PENDING', 'NONE') }],
    ['migrado sin activar', { m1: member('m1', 'MIGRATED', 'ACTIVE') }],
    ['rechazado', { m1: member('m1', 'REJECTED', 'NONE') }],
  ])('404 NOT_FOUND: socio %s', async (_name, byId) => {
    await expect(
      resolveSegmentRecipients(fakeClient({ byId }), {
        segment: 'SINGLE',
        targetMemberId: 'm1',
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('resolveSegmentRecipients - BY_RESOURCE', () => {
  beforeEach(() => {
    getResourceByIdMock.mockReset();
    findResourceOccupancyMock.mockReset();
  });

  it('404 si el recurso no existe', async () => {
    getResourceByIdMock.mockResolvedValue(undefined);
    await expect(
      resolveSegmentRecipients(fakeClient({}), {
        segment: 'BY_RESOURCE',
        resourceId: 'r1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(findResourceOccupancyMock).not.toHaveBeenCalled();
  });

  it('titulares de reservas activas y futuras, una sola vez por socio', async () => {
    getResourceByIdMock.mockResolvedValue({ resourceId: 'r1' });
    findResourceOccupancyMock.mockResolvedValue({
      activeReservations: [
        { holderMemberId: 'm1' },
        { holderMemberId: 'm2' },
        { holderMemberId: 'm1' },
      ],
      maintenanceBlocks: [],
    });
    const client = fakeClient({
      byId: { m1: member('m1', 'ACTIVE', 'ACTIVE'), m2: member('m2', 'ACTIVE', 'DEBT', 100) },
    });

    const recipients = await resolveSegmentRecipients(client, {
      segment: 'BY_RESOURCE',
      resourceId: 'r1',
      now: NOW,
    });

    expect(recipients.map((r) => r.memberId).sort()).toEqual(['m1', 'm2']);
    expect(findResourceOccupancyMock).toHaveBeenCalledWith(client, 'r1', {
      from: NOW,
      to: '9999-12-31T23:59:59.999Z',
    });
    // Un GetItem por titular distinto.
    expect(client.send).toHaveBeenCalledTimes(2);
  });

  it('descarta titulares sin cuenta digital o inexistentes', async () => {
    getResourceByIdMock.mockResolvedValue({ resourceId: 'r1' });
    findResourceOccupancyMock.mockResolvedValue({
      activeReservations: [
        { holderMemberId: 'm1' },
        { holderMemberId: 'm2' },
        { holderMemberId: 'm3' },
      ],
      maintenanceBlocks: [],
    });
    const client = fakeClient({
      byId: { m1: member('m1', 'ACTIVE', 'ACTIVE'), m2: member('m2', 'REJECTED', 'NONE') },
    });
    const recipients = await resolveSegmentRecipients(client, {
      segment: 'BY_RESOURCE',
      resourceId: 'r1',
      now: NOW,
    });
    expect(recipients.map((r) => r.memberId)).toEqual(['m1']);
  });

  it('recurso sin reservas activas devuelve lista vacía', async () => {
    getResourceByIdMock.mockResolvedValue({ resourceId: 'r1' });
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });
    const recipients = await resolveSegmentRecipients(fakeClient({}), {
      segment: 'BY_RESOURCE',
      resourceId: 'r1',
      now: NOW,
    });
    expect(recipients).toEqual([]);
  });
});
