import { describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Reservation, ReservationParticipant } from '@activa-club/shared-types';

vi.mock('../lib/dynamo', async () => {
  const actual = await vi.importActual<typeof import('../lib/dynamo')>('../lib/dynamo');
  return { ...actual, tableName: () => 'activa-club-test' };
});

const {
  findResourceOccupancy,
  writeReservation,
  hasActiveSubjectOverlap,
  getGuestProfile,
  getGuestMonthlyCounter,
  getReservationById,
  getReservationParticipants,
  listReservationsByHolder,
  listReservationsByStatus,
  listReservationsByResource,
  buildGuestMonthlyCounterDecrementTransactItem,
  writeCancellation,
  approveReservation,
  writeRejection,
} = await import('./repository');

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

interface CommandLike {
  constructor: { name: string };
  input: {
    IndexName?: string;
    Key?: Record<string, unknown>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

describe('hasActiveSubjectOverlap', () => {
  const overlappingParticipant = {
    entityType: 'ReservationParticipant',
    participantId: 'part-a',
    reservationId: 'res-a',
    participantType: 'MEMBER',
    memberId: 'member-2',
    guestDni: null,
    guestName: null,
    startsAt: '2026-07-12T11:00:00.000Z',
    endsAt: '2026-07-12T12:30:00.000Z',
    subjectKey: 'MEMBER#member-2',
  };

  it('consulta GSI1 por SUBJECT#<subjectKey> (patrón 13)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.IndexName).toBe('GSI1');
      expect(cmd.input.ExpressionAttributeValues).toEqual({ ':pk': 'SUBJECT#MEMBER#member-2' });
      return { Items: [] };
    });

    await hasActiveSubjectOverlap(client, 'MEMBER#member-2', window);
  });

  it('devuelve false si no hay participantes previos en el sujeto', async () => {
    const client = fakeClient(async () => ({ Items: [] }));

    await expect(hasActiveSubjectOverlap(client, 'MEMBER#member-2', window)).resolves.toBe(false);
  });

  it('devuelve false si los participantes encontrados no se solapan en el tiempo', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'QueryCommand') {
        return {
          Items: [
            {
              ...overlappingParticipant,
              startsAt: '2026-07-13T11:00:00.000Z',
              endsAt: '2026-07-13T12:30:00.000Z',
              reservationId: 'res-other-day',
            },
          ],
        };
      }
      throw new Error('No debería resolver la reserva madre si no hay solapamiento de tiempo');
    });

    await expect(hasActiveSubjectOverlap(client, 'MEMBER#member-2', window)).resolves.toBe(false);
  });

  it('devuelve true si el participante solapado pertenece a una reserva activa (CONFIRMED)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'QueryCommand') return { Items: [overlappingParticipant] };
      if (cmd.constructor.name === 'GetCommand') {
        expect(cmd.input.Key).toEqual({ PK: 'RESERVATION#res-a', SK: 'METADATA' });
        return {
          Item: { ...reservationRaw, reservationId: 'res-a', reservationStatus: 'CONFIRMED' },
        };
      }
      throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
    });

    await expect(hasActiveSubjectOverlap(client, 'MEMBER#member-2', window)).resolves.toBe(true);
  });

  it('devuelve false si la reserva madre del participante solapado ya está CANCELLED', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'QueryCommand') return { Items: [overlappingParticipant] };
      if (cmd.constructor.name === 'GetCommand') {
        return {
          Item: { ...reservationRaw, reservationId: 'res-a', reservationStatus: 'CANCELLED' },
        };
      }
      throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
    });

    await expect(hasActiveSubjectOverlap(client, 'MEMBER#member-2', window)).resolves.toBe(false);
  });

  it('deduplica GetCommand por reservationId cuando varios participantes del sujeto solapan la misma reserva', async () => {
    const getCalls: unknown[] = [];
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      if (cmd.constructor.name === 'QueryCommand') {
        return {
          Items: [overlappingParticipant, { ...overlappingParticipant, participantId: 'part-b' }],
        };
      }
      if (cmd.constructor.name === 'GetCommand') {
        getCalls.push(cmd.input.Key);
        return {
          Item: { ...reservationRaw, reservationId: 'res-a', reservationStatus: 'CONFIRMED' },
        };
      }
      throw new Error(`Comando inesperado: ${cmd.constructor.name}`);
    });

    await hasActiveSubjectOverlap(client, 'MEMBER#member-2', window);
    expect(getCalls).toHaveLength(1);
  });
});

describe('getGuestProfile', () => {
  it('lee GUEST#<dni>/PROFILE y proyecta el ítem tal cual', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.Key).toEqual({ PK: 'GUEST#70605040', SK: 'PROFILE' });
      return {
        Item: {
          guestDni: '70605040',
          firstName: 'Ana',
          lastName: 'Torres',
          createdByMemberId: 'member-1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      };
    });

    const profile = await getGuestProfile(client, '70605040');
    expect(profile?.firstName).toBe('Ana');
  });

  it('devuelve undefined si el invitado nunca fue registrado', async () => {
    const client = fakeClient(async () => ({}));

    await expect(getGuestProfile(client, '70605040')).resolves.toBeUndefined();
  });
});

describe('getGuestMonthlyCounter', () => {
  it('lee GUEST#<dni>/MONTH#<mes>', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
      return {
        Item: {
          guestDni: '70605040',
          month: '2026-07',
          visitCount: 1,
          reservationIds: ['res-1'],
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      };
    });

    const counter = await getGuestMonthlyCounter(client, '70605040', '2026-07');
    expect(counter?.visitCount).toBe(1);
  });

  it('devuelve undefined si el invitado no tiene visitas este mes', async () => {
    const client = fakeClient(async () => ({}));

    await expect(getGuestMonthlyCounter(client, '70605040', '2026-07')).resolves.toBeUndefined();
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
  it('escribe una única TransactWriteCommand con 3 ítems cuando no hay participantes adicionales: candado, cabecera y HOLDER', async () => {
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

  const memberParticipant: ReservationParticipant = {
    participantId: 'part-2',
    reservationId: 'res-1',
    participantType: 'MEMBER',
    memberId: 'member-2',
    guestDni: null,
    guestName: null,
    startsAt: '2026-07-12T11:00:00.000Z',
    endsAt: '2026-07-12T12:30:00.000Z',
  };

  const guestParticipant: ReservationParticipant = {
    participantId: 'part-3',
    reservationId: 'res-1',
    participantType: 'GUEST',
    memberId: null,
    guestDni: '70605040',
    guestName: 'Ana Torres',
    startsAt: '2026-07-12T11:00:00.000Z',
    endsAt: '2026-07-12T12:30:00.000Z',
  };

  it('agrega un Put por cada participante adicional (MEMBER/GUEST) con su subjectKey correcto', async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeReservation(fakeClient(send), {
      reservation,
      holderParticipant,
      additionalParticipants: [memberParticipant, guestParticipant],
      guestProfileUpserts: [
        {
          guestDni: '70605040',
          firstName: 'Ana',
          lastName: 'Torres',
          createdByMemberId: 'member-1',
        },
      ],
    });

    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: {
          Put?: { Item: Record<string, unknown>; ConditionExpression?: string };
          Update?: {
            Key: Record<string, unknown>;
            UpdateExpression: string;
            ConditionExpression?: string;
          };
        }[];
      };
    };
    const items = command.input.TransactItems;

    // 0 lock, 1 reservation, 2 holder, 3 member, 4 guest, 5 guestProfile upsert, 6 guestCounter
    expect(items).toHaveLength(7);

    const memberPut = items[3]?.Put;
    expect(memberPut?.Item['subjectKey']).toBe('MEMBER#member-2');
    expect(memberPut?.Item['GSI1PK']).toBe('SUBJECT#MEMBER#member-2');
    expect(memberPut?.ConditionExpression).toBe('attribute_not_exists(PK)');

    const guestPut = items[4]?.Put;
    expect(guestPut?.Item['subjectKey']).toBe('GUEST#70605040');
    expect(guestPut?.Item['GSI1PK']).toBe('SUBJECT#GUEST#70605040');
    expect(guestPut?.Item['guestName']).toBe('Ana Torres');

    const profileUpsert = items[5]?.Update;
    expect(profileUpsert?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'PROFILE' });
    expect(profileUpsert?.UpdateExpression).toContain('if_not_exists(firstName, :firstName)');
    expect(profileUpsert?.ConditionExpression).toBeUndefined();

    const counterUpdate = items[6]?.Update;
    expect(counterUpdate?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
    expect(counterUpdate?.ConditionExpression).toBe(
      'attribute_not_exists(visitCount) OR visitCount < :max',
    );
  });

  it('no agrega Update de GuestProfile/GuestMonthlyCounter si no hay participantes GUEST', async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeReservation(fakeClient(send), {
      reservation,
      holderParticipant,
      additionalParticipants: [memberParticipant],
    });

    const command = send.mock.calls[0]?.[0] as {
      input: { TransactItems: unknown[] };
    };
    // 0 lock, 1 reservation, 2 holder, 3 member
    expect(command.input.TransactItems).toHaveLength(4);
  });

  it('deduplica el GuestMonthlyCounter si (por error de arriba) el mismo dni aparece dos veces', async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeReservation(fakeClient(send), {
      reservation,
      holderParticipant,
      additionalParticipants: [guestParticipant, { ...guestParticipant, participantId: 'part-4' }],
      guestProfileUpserts: [
        {
          guestDni: '70605040',
          firstName: 'Ana',
          lastName: 'Torres',
          createdByMemberId: 'member-1',
        },
      ],
    });

    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: { Update?: { Key: Record<string, unknown> } }[];
      };
    };
    const counterUpdates = command.input.TransactItems.filter(
      (item) => item.Update?.Key['SK'] === 'MONTH#2026-07',
    );
    expect(counterUpdates).toHaveLength(1);
  });

  it('devuelve GUEST_LIMIT_EXCEEDED si falla la condición del GuestMonthlyCounter (criterio 6)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [
        { Code: 'None' }, // lock
        { Code: 'None' }, // reservation
        { Code: 'None' }, // holder
        { Code: 'None' }, // guest participant
        { Code: 'ConditionalCheckFailed' }, // guest monthly counter
      ],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    const outcome = await writeReservation(fakeClient(send), {
      reservation,
      holderParticipant,
      additionalParticipants: [guestParticipant],
    });

    expect(outcome).toBe('GUEST_LIMIT_EXCEEDED');
  });

  it('simula dos escrituras concurrentes por el cupo mensual del mismo invitado: solo una tiene éxito', async () => {
    const takenCounters = new Set<string>();
    const send = vi.fn(async (command: unknown) => {
      const input = (
        command as {
          input: {
            TransactItems: {
              Put?: { Item: Record<string, unknown> };
              Update?: { Key: Record<string, unknown> };
            }[];
          };
        }
      ).input;
      const counterItem = input.TransactItems.find(
        (item) => item.Update?.Key['SK'] === 'MONTH#2026-07',
      );
      const counterKey = `${counterItem?.Update?.Key['PK']}#${counterItem?.Update?.Key['SK']}`;
      if (takenCounters.has(counterKey)) {
        throw Object.assign(new Error('cancelled'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'None' },
            { Code: 'ConditionalCheckFailed' },
          ],
        });
      }
      takenCounters.add(counterKey);
      return {};
    });
    const client = fakeClient(send);

    const [first, second] = await Promise.all([
      writeReservation(client, {
        reservation,
        holderParticipant,
        additionalParticipants: [guestParticipant],
      }),
      writeReservation(client, {
        reservation: { ...reservation, reservationId: 'res-2', resourceId: 'tenis-1' },
        holderParticipant: { ...holderParticipant, reservationId: 'res-2' },
        additionalParticipants: [{ ...guestParticipant, reservationId: 'res-2' }],
      }),
    ]);

    const outcomes = [first, second].sort();
    expect(outcomes).toEqual(['CREATED', 'GUEST_LIMIT_EXCEEDED']);
  });
});

// --- US-033: listado, detalle y cancelación ---

describe('getReservationById', () => {
  it('lee RESERVATION#<id>/METADATA y recorta el ítem a la entidad pública', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.Key).toEqual({ PK: 'RESERVATION#res-1', SK: 'METADATA' });
      return { Item: reservationRaw };
    });

    const found = await getReservationById(client, 'res-1');
    expect(found).toEqual(reservation);
  });

  it('devuelve undefined si la reserva no existe', async () => {
    const client = fakeClient(async () => ({}));
    await expect(getReservationById(client, 'res-x')).resolves.toBeUndefined();
  });
});

describe('getReservationParticipants', () => {
  it('consulta PK=RESERVATION#<id>, begins_with(SK,"PARTICIPANT#") en la tabla base (patrón #8)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike;
      expect(cmd.input.IndexName).toBeUndefined();
      const input = cmd.input as unknown as {
        KeyConditionExpression?: string;
        ExpressionAttributeValues?: Record<string, unknown>;
      };
      expect(input.KeyConditionExpression).toBe('PK = :pk AND begins_with(SK, :prefix)');
      expect(input.ExpressionAttributeValues).toEqual({
        ':pk': 'RESERVATION#res-1',
        ':prefix': 'PARTICIPANT#',
      });
      return { Items: [holderParticipant] };
    });

    const participants = await getReservationParticipants(client, 'res-1');
    expect(participants).toEqual([holderParticipant]);
  });

  it('devuelve lista vacía si la reserva no tiene participantes (defensivo)', async () => {
    const client = fakeClient(async () => ({}));
    await expect(getReservationParticipants(client, 'res-1')).resolves.toEqual([]);
  });
});

describe('listReservationsByHolder', () => {
  it('consulta GSI1 PK=MEMBER#<id>, begins_with(GSI1SK,"RES#") (consulta 12)', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & {
        input: { KeyConditionExpression?: string; ScanIndexForward?: boolean };
      };
      expect(cmd.input.IndexName).toBe('GSI1');
      expect(cmd.input.KeyConditionExpression).toBe(
        'GSI1PK = :pk AND begins_with(GSI1SK, :prefix)',
      );
      expect(cmd.input.ExpressionAttributeValues).toEqual({
        ':pk': 'MEMBER#member-1',
        ':prefix': 'RES#',
      });
      expect(cmd.input.ScanIndexForward).toBe(true);
      return { Items: [reservationRaw] };
    });

    const result = await listReservationsByHolder(client, 'member-1');
    expect(result.items).toEqual([reservation]);
    expect(result.nextCursor).toBeNull();
  });

  it('aplica status/resourceId/from/to como FilterExpression adicional', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & { input: { FilterExpression?: string } };
      expect(cmd.input.FilterExpression).toBe(
        'reservationStatus = :status AND resourceId = :resourceId AND startsAt >= :from AND startsAt <= :to',
      );
      expect(cmd.input.ExpressionAttributeValues).toEqual({
        ':pk': 'MEMBER#member-1',
        ':prefix': 'RES#',
        ':status': 'CONFIRMED',
        ':resourceId': 'futbol-1',
        ':from': '2026-07-01T00:00:00.000Z',
        ':to': '2026-07-31T23:59:59.000Z',
      });
      return { Items: [] };
    });

    await listReservationsByHolder(client, 'member-1', {
      status: 'CONFIRMED',
      resourceId: 'futbol-1',
      from: '2026-07-01T00:00:00.000Z',
      to: '2026-07-31T23:59:59.000Z',
    });
  });

  it('codifica LastEvaluatedKey como nextCursor opaco', async () => {
    const client = fakeClient(async () => ({
      Items: [reservationRaw],
      LastEvaluatedKey: { PK: 'RESERVATION#res-1', SK: 'METADATA' },
    }));

    const result = await listReservationsByHolder(client, 'member-1');
    expect(result.nextCursor).not.toBeNull();
  });
});

describe('listReservationsByStatus', () => {
  it('consulta GSI2 PK=RESERVATION#STATUS#<status> (consulta 17), sin volver a filtrar status', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & {
        input: { KeyConditionExpression?: string; FilterExpression?: string };
      };
      expect(cmd.input.IndexName).toBe('GSI2');
      expect(cmd.input.KeyConditionExpression).toBe('GSI2PK = :pk');
      expect(cmd.input.ExpressionAttributeValues).toEqual({
        ':pk': 'RESERVATION#STATUS#PENDING_APPROVAL',
      });
      expect(cmd.input.FilterExpression).toBeUndefined();
      return { Items: [{ ...reservationRaw, reservationStatus: 'PENDING_APPROVAL' }] };
    });

    const result = await listReservationsByStatus(client, 'PENDING_APPROVAL');
    expect(result.items).toHaveLength(1);
  });

  it('aplica resourceId/from/to como FilterExpression adicional', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & { input: { FilterExpression?: string } };
      expect(cmd.input.FilterExpression).toBe('resourceId = :resourceId');
      return { Items: [] };
    });

    await listReservationsByStatus(client, 'CONFIRMED', { resourceId: 'futbol-1' });
  });
});

describe('listReservationsByResource', () => {
  it('consulta GSI3 PK=RESOURCE#<id> (consulta 19) y filtra entityType=Reservation', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & { input: { FilterExpression?: string } };
      expect(cmd.input.IndexName).toBe('GSI3');
      expect(cmd.input.FilterExpression).toBe('entityType = :entityType');
      expect(cmd.input.ExpressionAttributeValues).toEqual({
        ':pk': 'RESOURCE#futbol-1',
        ':entityType': 'Reservation',
      });
      return { Items: [reservationRaw, maintenanceBlockRaw] };
    });

    const result = await listReservationsByResource(client, 'futbol-1');
    // El fake client no aplica el FilterExpression de verdad (eso lo hace
    // DynamoDB); esta prueba solo verifica que la Query se arma con el filtro
    // correcto para que DynamoDB lo aplique.
    expect(result.items.map((item) => item.reservationId)).toContain('res-1');
  });

  it('combina el filtro de status con el de entityType', async () => {
    const client = fakeClient(async (command) => {
      const cmd = command as CommandLike & { input: { FilterExpression?: string } };
      expect(cmd.input.FilterExpression).toBe(
        'entityType = :entityType AND reservationStatus = :status',
      );
      return { Items: [] };
    });

    await listReservationsByResource(client, 'futbol-1', { status: 'CONFIRMED' });
  });
});

describe('buildGuestMonthlyCounterDecrementTransactItem', () => {
  const counter = {
    guestDni: '70605040',
    month: '2026-07',
    visitCount: 1,
    reservationIds: ['res-1', 'res-2'],
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('resta 1 a visitCount y quita reservationId de reservationIds', () => {
    const item = buildGuestMonthlyCounterDecrementTransactItem(
      'activa-club-test',
      counter,
      'res-1',
      '2026-07-15T00:00:00.000Z',
    );
    expect(item.Update?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
    expect(item.Update?.ConditionExpression).toBe('attribute_exists(PK)');
    expect(item.Update?.UpdateExpression).toBe(
      'SET visitCount = visitCount - :one, reservationIds = :newReservationIds, updatedAt = :now',
    );
    expect(item.Update?.ExpressionAttributeValues).toEqual({
      ':one': 1,
      ':newReservationIds': ['res-2'],
      ':now': '2026-07-15T00:00:00.000Z',
    });
  });

  it('no falla (ni deja rastro) si reservationId ya no estaba en la lista (defensivo)', () => {
    const item = buildGuestMonthlyCounterDecrementTransactItem(
      'activa-club-test',
      counter,
      'res-ajena',
      '2026-07-15T00:00:00.000Z',
    );
    expect(item.Update?.ExpressionAttributeValues?.[':newReservationIds']).toEqual([
      'res-1',
      'res-2',
    ]);
  });
});

describe('writeCancellation', () => {
  const guestCounter = {
    guestDni: '70605040',
    month: '2026-07',
    visitCount: 1,
    reservationIds: ['res-1'],
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('escribe una única TransactWriteCommand: Update de la cabecera + un decremento por cada contador', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await writeCancellation(fakeClient(send), {
      reservationId: 'res-1',
      cancelledAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [guestCounter],
    });

    expect(outcome).toBe('CANCELLED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: {
          Update?: {
            Key: Record<string, unknown>;
            ConditionExpression?: string;
            UpdateExpression: string;
            ExpressionAttributeValues?: Record<string, unknown>;
          };
        }[];
      };
    };
    const items = command.input.TransactItems;
    expect(items).toHaveLength(2);

    const headerUpdate = items[0]?.Update;
    expect(headerUpdate?.Key).toEqual({ PK: 'RESERVATION#res-1', SK: 'METADATA' });
    expect(headerUpdate?.ConditionExpression).toContain(
      'attribute_exists(PK) AND reservationStatus IN',
    );
    expect(headerUpdate?.UpdateExpression).toBe(
      'SET reservationStatus = :cancelled, cancelledAt = :now, updatedAt = :now, GSI2PK = :gsi2pk',
    );
    expect(headerUpdate?.ExpressionAttributeValues?.[':cancelled']).toBe('CANCELLED');
    expect(headerUpdate?.ExpressionAttributeValues?.[':gsi2pk']).toBe(
      'RESERVATION#STATUS#CANCELLED',
    );

    const counterUpdate = items[1]?.Update;
    expect(counterUpdate?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
  });

  it('no agrega ningún Update de contador si la reserva no tenía invitados', async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeCancellation(fakeClient(send), {
      reservationId: 'res-1',
      cancelledAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [],
    });

    const command = send.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    expect(command.input.TransactItems).toHaveLength(1);
  });

  it('devuelve ALREADY_DECIDED si falla la condición de la cabecera (criterio 8: ya CANCELLED/REJECTED)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    const outcome = await writeCancellation(fakeClient(send), {
      reservationId: 'res-1',
      cancelledAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [guestCounter],
    });

    expect(outcome).toBe('ALREADY_DECIDED');
  });

  it('propaga cualquier otro error (no relacionado con el estado de la cabecera)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      writeCancellation(fakeClient(send), {
        reservationId: 'res-1',
        cancelledAt: '2026-07-11T00:00:00.000Z',
        guestCounters: [],
      }),
    ).rejects.toThrow('network error');
  });
});

describe('approveReservation (US-034, criterios 2/5/8)', () => {
  const pendingReservationRaw = {
    ...reservationRaw,
    reservationId: 'res-parrilla',
    resourceType: 'PARRILLA',
    reservationStatus: 'PENDING_APPROVAL',
    requiresApproval: true,
  };

  it('transiciona PENDING_APPROVAL -> APPROVED con una única UpdateItem condicionada', async () => {
    const send = vi.fn(async (command: unknown) => {
      const input = (
        command as {
          input: {
            Key: Record<string, unknown>;
            ConditionExpression?: string;
            UpdateExpression?: string;
            ExpressionAttributeValues?: Record<string, unknown>;
          };
        }
      ).input;
      expect(input.Key).toEqual({ PK: 'RESERVATION#res-parrilla', SK: 'METADATA' });
      expect(input.ConditionExpression).toBe(
        'attribute_exists(PK) AND reservationStatus = :pending',
      );
      expect(input.UpdateExpression).toBe(
        'SET reservationStatus = :approved, GSI2PK = :gsi2pk, updatedAt = :now',
      );
      expect(input.ExpressionAttributeValues?.[':gsi2pk']).toBe('RESERVATION#STATUS#APPROVED');
      return { Attributes: { ...pendingReservationRaw, reservationStatus: 'APPROVED' } };
    });

    const outcome = await approveReservation(
      fakeClient(send),
      'res-parrilla',
      '2026-07-11T00:00:00.000Z',
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect((outcome as Reservation).reservationStatus).toBe('APPROVED');
  });

  it('devuelve NOT_PENDING si la condición falla (ya no está PENDING_APPROVAL, o carrera de dos admins)', async () => {
    const conditionalError = Object.assign(new Error('condition failed'), {
      name: 'ConditionalCheckFailedException',
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    await expect(
      approveReservation(fakeClient(send), 'res-parrilla', '2026-07-11T00:00:00.000Z'),
    ).resolves.toBe('NOT_PENDING');
  });

  it('propaga cualquier otro error (no relacionado con la condición)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      approveReservation(fakeClient(send), 'res-parrilla', '2026-07-11T00:00:00.000Z'),
    ).rejects.toThrow('network error');
  });

  it('simula dos administradores aprobando la misma solicitud a la vez: solo uno tiene éxito', async () => {
    let decided = false;
    const send = vi.fn(async () => {
      if (decided) {
        throw Object.assign(new Error('condition failed'), {
          name: 'ConditionalCheckFailedException',
        });
      }
      decided = true;
      return { Attributes: { ...pendingReservationRaw, reservationStatus: 'APPROVED' } };
    });
    const client = fakeClient(send);

    const [first, second] = await Promise.all([
      approveReservation(client, 'res-parrilla', '2026-07-11T00:00:00.000Z'),
      approveReservation(client, 'res-parrilla', '2026-07-11T00:00:00.000Z'),
    ]);

    const outcomes = [first, second].map((outcome) =>
      outcome === 'NOT_PENDING' ? 'NOT_PENDING' : (outcome as Reservation).reservationStatus,
    );
    expect(outcomes.sort()).toEqual(['APPROVED', 'NOT_PENDING']);
  });
});

describe('writeRejection (US-034, criterios 3/5/9/10)', () => {
  const guestCounter = {
    guestDni: '70605040',
    month: '2026-07',
    visitCount: 1,
    reservationIds: ['res-parrilla'],
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('escribe una única TransactWriteCommand: Update de la cabecera a REJECTED + un decremento por cada contador', async () => {
    const send = vi.fn().mockResolvedValue({});
    const outcome = await writeRejection(fakeClient(send), {
      reservationId: 'res-parrilla',
      rejectionReason: 'Recurso en mantenimiento',
      rejectedAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [guestCounter],
    });

    expect(outcome).toBe('REJECTED');
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0]?.[0] as {
      input: {
        TransactItems: {
          Update?: {
            Key: Record<string, unknown>;
            ConditionExpression?: string;
            UpdateExpression: string;
            ExpressionAttributeValues?: Record<string, unknown>;
          };
        }[];
      };
    };
    const items = command.input.TransactItems;
    expect(items).toHaveLength(2);

    const headerUpdate = items[0]?.Update;
    expect(headerUpdate?.Key).toEqual({ PK: 'RESERVATION#res-parrilla', SK: 'METADATA' });
    expect(headerUpdate?.ConditionExpression).toBe(
      'attribute_exists(PK) AND reservationStatus = :pending',
    );
    expect(headerUpdate?.UpdateExpression).toBe(
      'SET reservationStatus = :rejected, rejectionReason = :reason, updatedAt = :now, GSI2PK = :gsi2pk',
    );
    expect(headerUpdate?.ExpressionAttributeValues?.[':rejected']).toBe('REJECTED');
    expect(headerUpdate?.ExpressionAttributeValues?.[':reason']).toBe('Recurso en mantenimiento');
    expect(headerUpdate?.ExpressionAttributeValues?.[':gsi2pk']).toBe(
      'RESERVATION#STATUS#REJECTED',
    );

    const counterUpdate = items[1]?.Update;
    expect(counterUpdate?.Key).toEqual({ PK: 'GUEST#70605040', SK: 'MONTH#2026-07' });
  });

  it('no agrega ningún Update de contador si la reserva no tenía invitados', async () => {
    const send = vi.fn().mockResolvedValue({});
    await writeRejection(fakeClient(send), {
      reservationId: 'res-parrilla',
      rejectionReason: 'Recurso en mantenimiento',
      rejectedAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [],
    });

    const command = send.mock.calls[0]?.[0] as { input: { TransactItems: unknown[] } };
    expect(command.input.TransactItems).toHaveLength(1);
  });

  it('devuelve NOT_PENDING si falla la condición de la cabecera (ya decidida, o carrera de dos admins)', async () => {
    const conditionalError = Object.assign(new Error('cancelled'), {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });
    const send = vi.fn().mockRejectedValue(conditionalError);

    const outcome = await writeRejection(fakeClient(send), {
      reservationId: 'res-parrilla',
      rejectionReason: 'Recurso en mantenimiento',
      rejectedAt: '2026-07-11T00:00:00.000Z',
      guestCounters: [guestCounter],
    });

    expect(outcome).toBe('NOT_PENDING');
  });

  it('propaga cualquier otro error (no relacionado con el estado de la cabecera)', async () => {
    const send = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      writeRejection(fakeClient(send), {
        reservationId: 'res-parrilla',
        rejectionReason: 'Recurso en mantenimiento',
        rejectedAt: '2026-07-11T00:00:00.000Z',
        guestCounters: [],
      }),
    ).rejects.toThrow('network error');
  });

  it('simula dos administradores decidiendo la misma solicitud a la vez: solo uno tiene éxito', async () => {
    let decided = false;
    const send = vi.fn(async () => {
      if (decided) {
        throw Object.assign(new Error('cancelled'), {
          name: 'TransactionCanceledException',
          CancellationReasons: [{ Code: 'ConditionalCheckFailed' }],
        });
      }
      decided = true;
      return {};
    });
    const client = fakeClient(send);

    const [first, second] = await Promise.all([
      writeRejection(client, {
        reservationId: 'res-parrilla',
        rejectionReason: 'Recurso en mantenimiento',
        rejectedAt: '2026-07-11T00:00:00.000Z',
        guestCounters: [],
      }),
      writeRejection(client, {
        reservationId: 'res-parrilla',
        rejectionReason: 'Otro motivo',
        rejectedAt: '2026-07-11T00:00:00.000Z',
        guestCounters: [],
      }),
    ]);

    expect([first, second].sort()).toEqual(['NOT_PENDING', 'REJECTED']);
  });
});
