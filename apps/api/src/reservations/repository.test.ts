import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation, ReservationParticipant } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const { findResourceOccupancy, writeReservation } = await import('./repository');

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

const cancelledReservationRaw = {
  ...reservationRaw,
  reservationId: 'res-cancelled',
  reservationStatus: 'CANCELLED',
};

const nonOverlappingReservationRaw = {
  ...reservationRaw,
  reservationId: 'res-other-slot',
  startsAt: '2026-07-12T15:00:00.000Z',
  endsAt: '2026-07-12T16:30:00.000Z',
};

const maintenanceBlockRaw = {
  entityType: 'MaintenanceBlock',
  blockId: 'block-1',
  resourceId: 'futbol-1',
  startsAt: '2026-07-12T11:30:00.000Z',
  endsAt: '2026-07-12T13:00:00.000Z',
  reason: 'Mantenimiento de césped',
  createdBy: 'admin-1',
  createdAt: '2026-07-09T00:00:00.000Z',
};

const window = { from: '2026-07-12T11:00:00.000Z', to: '2026-07-12T12:30:00.000Z' };

describe('findResourceOccupancy', () => {
  it('consulta GSI3 por GSI3PK=RESOURCE#<id> sin condición de rango en el SK', async () => {
    const client = fakeClient(async (command) => {
      const input = (
        command as {
          input: {
            TableName?: string;
            IndexName?: string;
            KeyConditionExpression?: string;
            ExpressionAttributeValues?: Record<string, string>;
          };
        }
      ).input;
      expect(input.TableName).toBe('activa-club-test');
      expect(input.IndexName).toBe('GSI3');
      expect(input.KeyConditionExpression).toBe('GSI3PK = :pk');
      expect(input.ExpressionAttributeValues).toEqual({ ':pk': 'RESOURCE#futbol-1' });
      return { Items: [] };
    });

    await findResourceOccupancy(client, 'futbol-1', window);
  });

  it('discrimina Reservation de MaintenanceBlock por entityType y filtra por solapamiento', async () => {
    const client = fakeClient(async () => ({
      Items: [reservationRaw, maintenanceBlockRaw, nonOverlappingReservationRaw],
    }));

    const result = await findResourceOccupancy(client, 'futbol-1', window);

    expect(result.activeReservations).toHaveLength(1);
    expect(result.activeReservations[0]?.reservationId).toBe('res-1');
    expect(result.maintenanceBlocks).toHaveLength(1);
    expect(result.maintenanceBlocks[0]?.blockId).toBe('block-1');
  });

  it('excluye reservas CANCELLED/REJECTED (no activas), aunque se solapen con la ventana', async () => {
    const client = fakeClient(async () => ({ Items: [cancelledReservationRaw] }));

    const result = await findResourceOccupancy(client, 'futbol-1', window);

    expect(result.activeReservations).toEqual([]);
  });

  it('excluye ítems que no se solapan con la ventana consultada', async () => {
    const client = fakeClient(async () => ({ Items: [nonOverlappingReservationRaw] }));

    const result = await findResourceOccupancy(client, 'futbol-1', window);

    expect(result.activeReservations).toEqual([]);
  });

  it('devuelve listas vacías cuando el recurso no tiene ítems (defensivo)', async () => {
    const client = fakeClient(async () => ({}));

    const result = await findResourceOccupancy(client, 'futbol-1', window);

    expect(result).toEqual({ activeReservations: [], maintenanceBlocks: [] });
  });
});

const reservation: Reservation = {
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

const holderParticipant: ReservationParticipant = {
  participantId: 'part-1',
  reservationId: 'res-1',
  participantType: 'HOLDER',
  memberId: 'member-1',
  guestDni: null,
  guestName: null,
  startsAt: '2026-07-12T11:00:00.000Z',
  endsAt: '2026-07-12T12:30:00.000Z',
};

describe('writeReservation', () => {
  it('escribe una única TransactWriteCommand con 3 ítems: candado de franja, cabecera y participante HOLDER', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await writeReservation(fakeClient(send), { reservation, holderParticipant });

    expect(outcome).toBe('CREATED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: {
          Put: { Item: Record<string, unknown>; ConditionExpression?: string };
        }[];
      };
    };
    const items = command.input.TransactItems;
    expect(items).toHaveLength(3);

    const lock = items[0]?.Put;
    expect(lock?.Item['PK']).toBe('RESOURCE#futbol-1');
    expect(lock?.Item['SK']).toBe('SLOTLOCK#2026-07-12T11:00:00.000Z');
    expect(lock?.Item['entityType']).toBe('ReservationSlotLock');
    expect(lock?.ConditionExpression).toBe('attribute_not_exists(PK)');

    const reservationPut = items[1]?.Put;
    expect(reservationPut?.Item['PK']).toBe('RESERVATION#res-1');
    expect(reservationPut?.Item['SK']).toBe('METADATA');
    expect(reservationPut?.Item['GSI1PK']).toBe('MEMBER#member-1');
    expect(reservationPut?.Item['GSI1SK']).toBe('RES#2026-07-12T11:00:00.000Z#res-1');
    expect(reservationPut?.Item['GSI2PK']).toBe('RESERVATION#STATUS#CONFIRMED');
    expect(reservationPut?.Item['GSI3PK']).toBe('RESOURCE#futbol-1');
    expect(reservationPut?.Item['GSI3SK']).toBe('SLOT#2026-07-12T11:00:00.000Z#res-1');
    expect(reservationPut?.Item['entityType']).toBe('Reservation');
    expect(reservationPut?.ConditionExpression).toBe('attribute_not_exists(PK)');

    const participantPut = items[2]?.Put;
    expect(participantPut?.Item['PK']).toBe('RESERVATION#res-1');
    expect(participantPut?.Item['SK']).toBe('PARTICIPANT#part-1');
    expect(participantPut?.Item['GSI1PK']).toBe('SUBJECT#MEMBER#member-1');
    expect(participantPut?.Item['subjectKey']).toBe('MEMBER#member-1');
    expect(participantPut?.Item['entityType']).toBe('ReservationParticipant');
    expect(participantPut?.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('devuelve SLOT_TAKEN si falla la condición del candado de franja (índice 0) — criterio 14', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      writeReservation(fakeClient(send), { reservation, holderParticipant }),
    ).resolves.toBe('SLOT_TAKEN');
  });

  it('propaga cualquier otro error (no relacionado con el candado de franja)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      writeReservation(fakeClient(send), { reservation, holderParticipant }),
    ).rejects.toThrow('network error');
  });

  it('simula dos escrituras concurrentes por la misma franja exacta: solo una tiene éxito', async () => {
    const takenLocks = new Set<string>();
    const send = vi.fn(async (command: unknown) => {
      const input = (
        command as {
          input: { TransactItems: { Put: { Item: Record<string, unknown> } }[] };
        }
      ).input;
      const lockKey = `${input.TransactItems[0]?.Put.Item['PK']}#${input.TransactItems[0]?.Put.Item['SK']}`;
      if (takenLocks.has(lockKey)) {
        throw Object.assign(new Error('cancelled'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [
            { Code: 'ConditionalCheckFailed' },
            { Code: 'None' },
            { Code: 'None' },
          ],
        });
      }
      takenLocks.add(lockKey);
      return {};
    });
    const client = fakeClient(send);

    const [first, second] = await Promise.all([
      writeReservation(client, {
        reservation,
        holderParticipant,
      }),
      writeReservation(client, {
        reservation: { ...reservation, reservationId: 'res-2' },
        holderParticipant: { ...holderParticipant, reservationId: 'res-2' },
      }),
    ]);

    const outcomes = [first, second].sort();
    expect(outcomes).toEqual(['CREATED', 'SLOT_TAKEN']);
  });
});
