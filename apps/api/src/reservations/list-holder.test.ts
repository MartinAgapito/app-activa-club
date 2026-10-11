import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { listReservations } = await import('./list');

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, string>;
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

const member = {
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
  membershipType: 'MONTHLY',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00.000Z',
  membershipEndsAt: '2026-12-31T00:00:00.000Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const reservationRaw = (reservationId: string, holderMemberId: string) => ({
  entityType: 'Reservation',
  reservationId,
  resourceId: 'futbol-1',
  resourceType: 'FUTBOL',
  holderMemberId,
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
});

function buildClient(items: unknown[], members: Record<string, unknown>) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'QueryCommand') {
      return { Items: items };
    }
    if (cmd.constructor.name === 'GetCommand') {
      const pk = cmd.input.Key?.['PK'] ?? '';
      const found = members[pk.slice('MEMBER#'.length)];
      return found ? { Item: found } : {};
    }
    throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
  });
}

describe('listReservations scope=all: socio titular (US-036, criterio 8)', () => {
  it('agrega holder {memberId, firstName, lastName} a cada ítem, sin datos sensibles', async () => {
    const client = buildClient([reservationRaw('res-1', 'member-1')], { 'member-1': member });

    const result = await listReservations({
      cognitoSub: 'admin-sub',
      scope: 'all',
      status: 'CONFIRMED',
      client,
    });

    expect(result.items).toHaveLength(1);
    const item = result.items[0] as unknown as { holder: Record<string, unknown> };
    expect(item.holder).toEqual({ memberId: 'member-1', firstName: 'María', lastName: 'Quispe' });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('maria@example.com');
    expect(serialized).not.toContain('45678912');
    expect(serialized).not.toContain('999888777');
  });

  it('deduplica titulares: un socio con varias reservas se resuelve una sola vez', async () => {
    const client = buildClient(
      [
        reservationRaw('res-1', 'member-1'),
        reservationRaw('res-2', 'member-1'),
        reservationRaw('res-3', 'member-2'),
      ],
      { 'member-1': member, 'member-2': { ...member, memberId: 'member-2', firstName: 'Luis' } },
    );

    const result = await listReservations({
      cognitoSub: 'admin-sub',
      scope: 'all',
      status: 'CONFIRMED',
      client,
    });

    const getCalls = client.send.mock.calls.filter(
      ([command]) => (command as CommandLike).constructor.name === 'GetCommand',
    );
    expect(getCalls).toHaveLength(2);
    const holders = result.items.map(
      (item) => (item as unknown as { holder: { memberId: string } }).holder.memberId,
    );
    expect(holders).toEqual(['member-1', 'member-1', 'member-2']);
  });

  it('devuelve holder null si el socio no se puede resolver', async () => {
    const client = buildClient([reservationRaw('res-1', 'member-borrado')], {});

    const result = await listReservations({
      cognitoSub: 'admin-sub',
      scope: 'all',
      resourceId: 'futbol-1',
      client,
    });

    expect((result.items[0] as unknown as { holder: unknown }).holder).toBeNull();
  });

  it('scope=me no agrega holder (el listado del socio no cambia)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.input.ExpressionAttributeValues?.[':pk'] === 'COGNITO#sub-1') {
        return { Items: [member] };
      }
      return { Items: [reservationRaw('res-1', 'member-1')] };
    });

    const result = await listReservations({ cognitoSub: 'sub-1', scope: 'me', client });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('holder');
  });
});
