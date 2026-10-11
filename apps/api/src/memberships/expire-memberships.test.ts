import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Almacén en memoria que reproduce la semántica relevante de DynamoDB: el
// índice GSI2 (períodos vigentes) y la escritura condicional sobre el Member.
interface FakeMember {
  memberId: string;
  memberStatus: string;
  membershipStatus: string;
  membershipEndsAt: string | null;
  outstandingBalance: number;
}
interface FakePeriod {
  PK: string;
  SK: string;
  endsAt: string;
  inIndex: boolean;
}

const store = {
  members: new Map<string, FakeMember>(),
  periods: [] as FakePeriod[],
  transitions: [] as Array<{ memberId: string; toStatus: string; membershipEndsAt: string }>,
  /** Simula una renovación justo antes de la escritura de este socio. */
  renewBeforeWrite: new Set<string>(),
  failOn: new Set<string>(),
};

const applyMock = vi.fn(async (_client: unknown, input: Record<string, unknown>) => {
  const memberId = input['memberId'] as string;
  if (store.failOn.has(memberId)) throw new Error('dynamo exploded');
  const member = store.members.get(memberId)!;
  if (store.renewBeforeWrite.has(memberId)) {
    member.membershipStatus = 'ACTIVE';
    member.membershipEndsAt = '2026-08-30';
  }
  if (
    member.membershipStatus !== input['from'] ||
    member.membershipEndsAt !== input['membershipEndsAt']
  ) {
    return 'STALE';
  }
  member.membershipStatus = input['to'] as string;
  store.transitions.push({
    memberId,
    toStatus: input['to'] as string,
    membershipEndsAt: input['membershipEndsAt'] as string,
  });
  if (input['to'] === 'EXPIRED') {
    const period = input['period'] as { SK: string } | undefined;
    const found = store.periods.find((p) => p.SK === period?.SK);
    if (found) found.inIndex = false;
  }
  return 'APPLIED';
});

vi.mock('./repository', () => ({
  listActivePeriodsEndingBefore: vi.fn(async (_client: unknown, before: string) =>
    store.periods
      .filter((p) => p.inIndex && p.endsAt < before)
      .map((p) => ({
        PK: p.PK,
        SK: p.SK,
        memberId: p.PK.slice('MEMBER#'.length),
        endsAt: p.endsAt,
      })),
  ),
  applyVigencyTransition: applyMock,
  removePeriodFromActiveIndex: vi.fn(async (_client: unknown, period: { SK: string }) => {
    const found = store.periods.find((p) => p.SK === period.SK && p.inIndex);
    if (!found) return false;
    found.inIndex = false;
    return true;
  }),
}));

vi.mock('../members/repository', () => ({
  getMemberById: vi.fn(async (_client: unknown, memberId: string) => store.members.get(memberId)),
}));

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { expireMemberships } = await import('./expire-memberships');
const { logger } = await import('../lib/logger');

// 2026-07-10 10:00 en Lima.
const NOW = new Date('2026-07-10T15:00:00Z');
const client = {} as DynamoDBDocumentClient;

function addMember(
  memberId: string,
  membershipStatus: string,
  membershipEndsAt: string,
  extra: Partial<FakeMember> = {},
): void {
  store.members.set(memberId, {
    memberId,
    memberStatus: 'ACTIVE',
    membershipStatus,
    membershipEndsAt,
    outstandingBalance: 0,
    ...extra,
  });
  store.periods.push({
    PK: `MEMBER#${memberId}`,
    SK: `MEMBERSHIP#${memberId}`,
    endsAt: membershipEndsAt,
    inIndex: true,
  });
}

beforeEach(() => {
  store.members.clear();
  store.periods = [];
  store.transitions = [];
  store.renewBeforeWrite.clear();
  store.failOn.clear();
  applyMock.mockClear();
  vi.mocked(logger.info).mockClear();
  vi.mocked(logger.error).mockClear();
});

describe('expireMemberships (US-038)', () => {
  it('aplica las transiciones por umbral: vencida -> EXPIRED, vence hoy/en 7 -> EXPIRING_SOON, en 8 sin cambio', async () => {
    addMember('ayer', 'ACTIVE', '2026-07-09');
    addMember('hoy', 'ACTIVE', '2026-07-10');
    addMember('en7', 'ACTIVE', '2026-07-17');
    addMember('en8', 'ACTIVE', '2026-07-18');
    addMember('porVencerYaVencida', 'EXPIRING_SOON', '2026-07-08');

    const summary = await expireMemberships({ client, now: NOW });

    expect(store.members.get('ayer')?.membershipStatus).toBe('EXPIRED');
    expect(store.members.get('hoy')?.membershipStatus).toBe('EXPIRING_SOON');
    expect(store.members.get('en7')?.membershipStatus).toBe('EXPIRING_SOON');
    expect(store.members.get('en8')?.membershipStatus).toBe('ACTIVE');
    expect(store.members.get('porVencerYaVencida')?.membershipStatus).toBe('EXPIRED');
    expect(summary).toMatchObject({
      todayLima: '2026-07-10',
      evaluated: 5,
      toExpiringSoon: 2,
      toExpired: 2,
      errors: 0,
    });
  });

  it('no modifica DEBT ni NONE aunque la vigencia haya pasado, ni memberStatus ni saldo (criterios 4 y 5)', async () => {
    addMember('deuda', 'DEBT', '2026-01-01', { outstandingBalance: 5000 });
    addMember('sinMembresia', 'NONE', '2026-01-01');
    addMember('migrado', 'ACTIVE', '2026-07-01', { memberStatus: 'MIGRATED' });

    await expireMemberships({ client, now: NOW });

    expect(store.members.get('deuda')).toMatchObject({
      membershipStatus: 'DEBT',
      outstandingBalance: 5000,
    });
    expect(store.members.get('sinMembresia')?.membershipStatus).toBe('NONE');
    // Socio migrado sin activar: también se recalcula, y sigue MIGRATED.
    expect(store.members.get('migrado')).toMatchObject({
      membershipStatus: 'EXPIRED',
      memberStatus: 'MIGRATED',
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
  });

  it('es idempotente: la segunda ejecución no registra transiciones (criterio 6)', async () => {
    addMember('ayer', 'ACTIVE', '2026-07-09');
    addMember('hoy', 'ACTIVE', '2026-07-10');

    const first = await expireMemberships({ client, now: NOW });
    const second = await expireMemberships({ client, now: NOW });

    expect(first.toExpired + first.toExpiringSoon).toBe(2);
    expect(second.toExpired).toBe(0);
    // 'hoy' sigue en el índice (por vencer) y se reevalúa, pero sin cambio.
    expect(second.toExpiringSoon).toBe(0);
    expect(store.transitions).toHaveLength(2);
  });

  it('no pisa una renovación concurrente: ConditionalCheckFailed manejado (criterio 7)', async () => {
    addMember('renueva', 'ACTIVE', '2026-07-09');
    addMember('normal', 'ACTIVE', '2026-07-09');
    store.renewBeforeWrite.add('renueva');

    const summary = await expireMemberships({ client, now: NOW });

    expect(store.members.get('renueva')).toMatchObject({
      membershipStatus: 'ACTIVE',
      membershipEndsAt: '2026-08-30',
    });
    expect(store.members.get('normal')?.membershipStatus).toBe('EXPIRED');
    expect(summary).toMatchObject({ skippedConcurrent: 1, toExpired: 1, errors: 0 });
  });

  it('un error con un socio no detiene al resto y queda en el log (criterios 9 y 10)', async () => {
    addMember('falla', 'ACTIVE', '2026-07-09');
    addMember('ok', 'ACTIVE', '2026-07-09');
    store.failOn.add('falla');

    const summary = await expireMemberships({ client, now: NOW, requestId: 'req-1' });

    expect(store.members.get('ok')?.membershipStatus).toBe('EXPIRED');
    expect(summary.errors).toBe(1);
    expect(logger.error).toHaveBeenCalledWith(
      'membership vigency evaluation failed',
      expect.objectContaining({ memberId: 'falla', requestId: 'req-1' }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'membership expiration run completed',
      expect.objectContaining({
        evaluated: 2,
        toExpired: 1,
        toExpiringSoon: 0,
        errors: 1,
        outcome: 'FAILURE',
      }),
    );
  });

  it('retira de GSI2 los períodos reemplazados por una renovación sin cambiar el estado', async () => {
    addMember('renovado', 'ACTIVE', '2026-09-30');
    // Período antiguo, ya renovado, que quedó en el índice.
    store.periods.push({
      PK: 'MEMBER#renovado',
      SK: 'MEMBERSHIP#viejo',
      endsAt: '2026-07-05',
      inIndex: true,
    });

    const summary = await expireMemberships({ client, now: NOW });

    expect(store.members.get('renovado')?.membershipStatus).toBe('ACTIVE');
    expect(store.periods.find((p) => p.SK === 'MEMBERSHIP#viejo')?.inIndex).toBe(false);
    expect(summary).toMatchObject({ supersededCleaned: 1, toExpired: 0, toExpiringSoon: 0 });
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('proceso caído varios días: la siguiente ejecución pone al día a todos', async () => {
    addMember('haceUnaSemana', 'ACTIVE', '2026-07-03');
    const summary = await expireMemberships({ client, now: NOW });
    expect(store.members.get('haceUnaSemana')?.membershipStatus).toBe('EXPIRED');
    expect(summary.toExpired).toBe(1);
  });
});
