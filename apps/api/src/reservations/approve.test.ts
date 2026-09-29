import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { approveReservation } = await import('./approve');

interface CommandLike {
  constructor: { name: string };
  input: { Key?: Record<string, unknown> };
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

const actor = { actorId: 'admin-1', actorRole: 'admin' as const };

interface BuildClientOptions {
  reservation?: Record<string, unknown> | null;
  updateError?: Error;
}

function buildClient(options: BuildClientOptions) {
  return fakeClient(async (command) => {
    const cmd = command as CommandLike;
    if (cmd.constructor.name === 'GetCommand') {
      return options.reservation ? { Item: options.reservation } : {};
    }
    if (cmd.constructor.name === 'UpdateCommand') {
      if (options.updateError) throw options.updateError;
      return { Attributes: { ...options.reservation, reservationStatus: 'APPROVED' } };
    }
    if (cmd.constructor.name === 'PutCommand') {
      return {};
    }
    throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
  });
}

describe('approveReservation (US-034, criterios 2/5/6/7/8/11)', () => {
  it('criterio 2: aprueba una reserva PENDING_APPROVAL y responde 200 con APPROVED', async () => {
    const client = buildClient({ reservation: pendingReservationRaw });

    const result = await approveReservation({ reservationId: 'res-parrilla', actor, client });

    expect(result).toEqual({ reservationId: 'res-parrilla', reservationStatus: 'APPROVED' });
  });

  it('devuelve NOT_FOUND (404) si la reserva no existe', async () => {
    const client = buildClient({ reservation: null });

    await expect(
      approveReservation({ reservationId: 'res-x', actor, client }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('criterio 5: una reserva ya APPROVED devuelve RESERVATION_NOT_PENDING (409)', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = buildClient({
      reservation: { ...pendingReservationRaw, reservationStatus: 'APPROVED' },
      updateError: conditionalError,
    });

    await expect(
      approveReservation({ reservationId: 'res-parrilla', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
  });

  it('caso alternativo: solicitud cancelada por el socio antes de la decisión devuelve RESERVATION_NOT_PENDING', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const client = buildClient({
      reservation: { ...pendingReservationRaw, reservationStatus: 'CANCELLED' },
      updateError: conditionalError,
    });

    await expect(
      approveReservation({ reservationId: 'res-parrilla', actor, client }),
    ).rejects.toMatchObject({ code: 'RESERVATION_NOT_PENDING' });
  });

  it('criterio 11: deja auditoría RESERVATION_APPROVED con el actor y la reserva objetivo', async () => {
    const client = buildClient({ reservation: pendingReservationRaw });

    await approveReservation({ reservationId: 'res-parrilla', actor, client });

    const auditCall = (client.send as ReturnType<typeof vi.fn>).mock.calls.find(
      ([command]) => (command as CommandLike).constructor.name === 'PutCommand',
    )?.[0] as { input: { Item: Record<string, unknown> } };
    expect(auditCall.input.Item['action']).toBe('RESERVATION_APPROVED');
    expect(auditCall.input.Item['actorId']).toBe('admin-1');
    expect(auditCall.input.Item['targetId']).toBe('res-parrilla');
  });

  it('caso alternativo: dos administradores aprobando a la vez — el segundo recibe RESERVATION_NOT_PENDING', async () => {
    let decided = false;
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'GetCommand') return { Item: pendingReservationRaw };
      if (cmd.constructor.name === 'UpdateCommand') {
        if (decided) {
          throw Object.assign(new Error('condition failed'), {
            name: 'ConditionalCheckFailedException',
          });
        }
        decided = true;
        return { Attributes: { ...pendingReservationRaw, reservationStatus: 'APPROVED' } };
      }
      if (cmd.constructor.name === 'PutCommand') return {};
      throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
    });

    const results = await Promise.allSettled([
      approveReservation({ reservationId: 'res-parrilla', actor, client }),
      approveReservation({ reservationId: 'res-parrilla', actor, client }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: 'RESERVATION_NOT_PENDING',
    });
  });
});
