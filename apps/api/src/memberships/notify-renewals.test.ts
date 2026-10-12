import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// Almacén en memoria con la semántica relevante: cola GSI2 de rastros
// pendientes (se vacía al marcar procesado) y bandeja idempotente por clave
// `evento#socio#entityId`.
interface FakeMember {
  memberId: string;
  memberStatus: string;
  membershipStatus: string;
  membershipEndsAt: string | null;
  email: string;
  firstName: string;
  autoRenew?: boolean;
}
interface FakeTransition {
  PK: string;
  SK: string;
  memberId: string;
  event: 'RENEWAL_DUE' | 'RENEWAL_OVERDUE';
  membershipEndsAt: string;
  pending: boolean;
  processedOutcome?: string;
}

const store = {
  members: new Map<string, FakeMember>(),
  transitions: [] as FakeTransition[],
  inbox: new Set<string>(),
  emitted: [] as Array<Record<string, unknown>>,
  /** memberIds cuyo `getMemberById` lanza. */
  lookupFails: new Set<string>(),
  /** memberIds cuya bandeja falla (`inbox: FAILED`). */
  inboxFails: new Set<string>(),
  /** memberIds cuyo emisor lanza una excepción. */
  emitThrows: new Set<string>(),
  /** Simula que otro proceso ya retiró el rastro (markTransitionProcessed -> false). */
  markReturnsFalse: false,
};

vi.mock('../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./repository', () => ({
  listPendingTransitions: vi.fn(async () =>
    store.transitions.filter((t) => t.pending).map(({ pending: _p, ...rest }) => rest),
  ),
  markTransitionProcessed: vi.fn(
    async (_client: unknown, key: { PK: string; SK: string }, outcome: string) => {
      if (store.markReturnsFalse) return false;
      const found = store.transitions.find((t) => t.PK === key.PK && t.SK === key.SK);
      if (!found || !found.pending) return false;
      found.pending = false;
      found.processedOutcome = outcome;
      return true;
    },
  ),
}));

vi.mock('../members/repository', () => ({
  getMemberById: vi.fn(async (_client: unknown, memberId: string) => {
    if (store.lookupFails.has(memberId)) throw new Error('dynamo exploded');
    return store.members.get(memberId);
  }),
}));

const { notifyRenewals } = await import('./notify-renewals');
const { buildDedupeKey } = await import('../notifications');

const client = {} as DynamoDBDocumentClient;
const NOW = new Date('2026-07-10T13:00:00.000Z');

const emit = vi.fn(async (input: Record<string, unknown>) => {
  const member = input['member'] as { memberId: string };
  if (store.emitThrows.has(member.memberId)) throw new Error('programming error');
  if (store.inboxFails.has(member.memberId)) {
    return { inbox: 'FAILED', email: 'SKIPPED', notificationId: 'n' };
  }
  const key = buildDedupeKey(
    input['event'] as string,
    member.memberId,
    input['entityId'] as string,
  );
  if (store.inbox.has(key)) return { inbox: 'DUPLICATE', email: 'SKIPPED', notificationId: key };
  store.inbox.add(key);
  store.emitted.push(input);
  return { inbox: 'WRITTEN', email: 'SENT', notificationId: key };
});

function run() {
  return notifyRenewals({
    client,
    now: NOW,
    requestId: 'evt-1',
    emitDeps: { emit: emit as never },
  });
}

function addMember(id: string, overrides: Partial<FakeMember> = {}): void {
  store.members.set(id, {
    memberId: id,
    memberStatus: 'ACTIVE',
    membershipStatus: 'EXPIRING_SOON',
    membershipEndsAt: '2026-07-14',
    email: `${id}@example.com`,
    firstName: `Nombre-${id}`,
    ...overrides,
  });
}

function addTransition(
  memberId: string,
  event: 'RENEWAL_DUE' | 'RENEWAL_OVERDUE',
  membershipEndsAt: string,
): void {
  const to = event === 'RENEWAL_DUE' ? 'EXPIRING_SOON' : 'EXPIRED';
  store.transitions.push({
    PK: `MEMBER#${memberId}`,
    SK: `MEMBERSHIP_TRANSITION#${membershipEndsAt}#${to}`,
    memberId,
    event,
    membershipEndsAt,
    pending: true,
  });
}

describe('notifyRenewals (US-047)', () => {
  beforeEach(() => {
    store.members.clear();
    store.transitions.length = 0;
    store.inbox.clear();
    store.emitted.length = 0;
    store.lookupFails.clear();
    store.inboxFails.clear();
    store.emitThrows.clear();
    store.markReturnsFalse = false;
    emit.mockClear();
  });

  it('cola vacía: no emite nada y devuelve ceros', async () => {
    await expect(run()).resolves.toEqual({
      evaluated: 0,
      notified: 0,
      skipped: 0,
      duplicates: 0,
      errors: 0,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it('criterio 1: transición a EXPIRING_SOON emite RENEWAL_DUE con la vigencia y retira el rastro', async () => {
    addMember('m1');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    const summary = await run();

    expect(summary).toMatchObject({ evaluated: 1, notified: 1, skipped: 0, errors: 0 });
    expect(emit).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['event']).toBe('RENEWAL_DUE');
    expect(call['data']).toEqual({ membershipEndsAt: '2026-07-14' });
    expect(call['entityId']).toBe('2026-07-14');
    expect(call['member']).toEqual({
      memberId: 'm1',
      email: 'm1@example.com',
      firstName: 'Nombre-m1',
    });
    expect(store.transitions[0]).toMatchObject({ pending: false, processedOutcome: 'NOTIFIED' });
  });

  it('criterio 2: transición a EXPIRED emite RENEWAL_OVERDUE', async () => {
    addMember('m1', { membershipStatus: 'EXPIRED', membershipEndsAt: '2026-07-09' });
    addTransition('m1', 'RENEWAL_OVERDUE', '2026-07-09');

    const summary = await run();

    expect(summary).toMatchObject({ evaluated: 1, notified: 1, errors: 0 });
    const call = emit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['event']).toBe('RENEWAL_OVERDUE');
    expect(call['data']).toEqual({ membershipEndsAt: '2026-07-09' });
  });

  it('procesa ambos eventos del mismo socio en ciclos de días distintos (un aviso por tipo)', async () => {
    // Día 1: por vencer.
    addMember('m1');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');
    await run();
    // Día 2+: vence sin renovar; el rastro de EXPIRED llega a la cola.
    addTransition('m1', 'RENEWAL_OVERDUE', '2026-07-14');
    store.members.get('m1')!.membershipStatus = 'EXPIRED';
    await run();

    expect(store.emitted.map((e) => e['event'])).toEqual(['RENEWAL_DUE', 'RENEWAL_OVERDUE']);
  });

  it('criterio 3: doble ejecución el mismo día no duplica (la segunda ve la cola vacía)', async () => {
    addMember('m1');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    await run();
    const second = await run();

    expect(second.evaluated).toBe(0);
    expect(store.emitted).toHaveLength(1);
  });

  it('criterio 3: si el retiro falló tras emitir, el reintento no duplica el aviso (DUPLICATE) y retira el rastro', async () => {
    addMember('m1');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');
    // Primera corrida: emitió, pero el retiro del rastro no ocurrió (se cayó el proceso).
    store.markReturnsFalse = true;
    await run();
    expect(store.transitions[0]?.pending).toBe(true);

    store.markReturnsFalse = false;
    const retry = await run();

    expect(retry).toMatchObject({ evaluated: 1, notified: 1, duplicates: 1, errors: 0 });
    expect(store.emitted).toHaveLength(1);
    expect(store.transitions[0]?.pending).toBe(false);
  });

  it('criterio 6: socio que ya renovó (vigencia distinta) no recibe aviso y el rastro queda procesado', async () => {
    addMember('m1', { membershipStatus: 'ACTIVE', membershipEndsAt: '2026-08-14' });
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    const summary = await run();

    expect(summary).toMatchObject({ evaluated: 1, notified: 0, skipped: 1, errors: 0 });
    expect(emit).not.toHaveBeenCalled();
    expect(store.transitions[0]).toMatchObject({
      pending: false,
      processedOutcome: 'SKIPPED_RENEWED',
    });
  });

  it('criterio 6: renovó tras vencer, el rastro EXPIRED tampoco avisa', async () => {
    addMember('m1', { membershipStatus: 'ACTIVE', membershipEndsAt: '2026-08-14' });
    addTransition('m1', 'RENEWAL_OVERDUE', '2026-07-09');

    await run();

    expect(emit).not.toHaveBeenCalled();
    expect(store.transitions[0]?.processedOutcome).toBe('SKIPPED_RENEWED');
  });

  it('criterio 5: socio MIGRATED (sin cuenta digital) no recibe aviso', async () => {
    addMember('m1', { memberStatus: 'MIGRATED' });
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    const summary = await run();

    expect(summary).toMatchObject({ notified: 0, skipped: 1 });
    expect(emit).not.toHaveBeenCalled();
    expect(store.transitions[0]?.processedOutcome).toBe('SKIPPED_NOT_ELIGIBLE');
  });

  it('RENEWAL_DUE atrasado: si el socio ya venció, no avisa "por vencer" (superado)', async () => {
    addMember('m1', { membershipStatus: 'EXPIRED', membershipEndsAt: '2026-07-14' });
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    await run();

    expect(emit).not.toHaveBeenCalled();
    expect(store.transitions[0]?.processedOutcome).toBe('SKIPPED_SUPERSEDED');
  });

  it('socio inexistente: el rastro se descarta sin error', async () => {
    addTransition('ghost', 'RENEWAL_DUE', '2026-07-14');

    const summary = await run();

    expect(summary).toMatchObject({ skipped: 1, errors: 0 });
    expect(store.transitions[0]?.processedOutcome).toBe('SKIPPED_MEMBER_NOT_FOUND');
  });

  it('criterio 4: con autoRenew=true recibe el mismo aviso, sin dato extra de cobro', async () => {
    addMember('m1', { autoRenew: true });
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');

    await run();

    const call = emit.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call['data']).toEqual({ membershipEndsAt: '2026-07-14' });
  });

  it('criterio 7: error parcial (lookup lanza) no interrumpe al resto; el rastro fallido sigue pendiente', async () => {
    addMember('m1');
    addMember('m2');
    addMember('m3');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');
    addTransition('m2', 'RENEWAL_DUE', '2026-07-14');
    addTransition('m3', 'RENEWAL_DUE', '2026-07-14');
    store.lookupFails.add('m2');

    const summary = await run();

    expect(summary).toMatchObject({ evaluated: 3, notified: 2, errors: 1 });
    expect(store.transitions.map((t) => t.pending)).toEqual([false, true, false]);
  });

  it('criterio 7: bandeja FAILED o emisor que lanza cuentan como error y dejan el rastro pendiente', async () => {
    addMember('m1');
    addMember('m2');
    addMember('m3');
    addTransition('m1', 'RENEWAL_DUE', '2026-07-14');
    addTransition('m2', 'RENEWAL_DUE', '2026-07-14');
    addTransition('m3', 'RENEWAL_DUE', '2026-07-14');
    store.inboxFails.add('m1');
    store.emitThrows.add('m2');

    const summary = await run();

    expect(summary).toMatchObject({ evaluated: 3, notified: 1, errors: 2 });
    expect(store.transitions.map((t) => t.pending)).toEqual([true, true, false]);

    // El día siguiente, con el problema resuelto, se reintenta y se avisa.
    store.inboxFails.clear();
    store.emitThrows.clear();
    const retry = await run();
    expect(retry).toMatchObject({ evaluated: 2, notified: 2, errors: 0 });
    expect(store.emitted).toHaveLength(3);
  });

  it('un lote mixto con ambos eventos devuelve el resumen correcto', async () => {
    addMember('due');
    addMember('late', { membershipStatus: 'EXPIRED', membershipEndsAt: '2026-07-09' });
    addMember('renewed', { membershipStatus: 'ACTIVE', membershipEndsAt: '2026-09-01' });
    addMember('mig', { memberStatus: 'MIGRATED' });
    addTransition('due', 'RENEWAL_DUE', '2026-07-14');
    addTransition('late', 'RENEWAL_OVERDUE', '2026-07-09');
    addTransition('renewed', 'RENEWAL_DUE', '2026-07-14');
    addTransition('mig', 'RENEWAL_OVERDUE', '2026-07-09');

    await expect(run()).resolves.toEqual({
      evaluated: 4,
      notified: 2,
      skipped: 2,
      duplicates: 0,
      errors: 0,
    });
  });
});
