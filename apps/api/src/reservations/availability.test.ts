import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { MaintenanceBlock, Reservation, Resource } from '@activa-club/shared-types';

const getResourceByIdMock = vi.fn();
vi.mock('../resources/repository', () => ({ getResourceById: getResourceByIdMock }));

const findResourceOccupancyMock = vi.fn();
vi.mock('./repository', () => ({ findResourceOccupancy: findResourceOccupancyMock }));

const { getResourceAvailability } = await import('./availability');

// Cliente nunca invocado directamente: `getResourceById`/`findResourceOccupancy`
// están mockeados a nivel de módulo (no DynamoDB real).
const fakeClient = {} as DynamoDBDocumentClient;

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

// Primer slot de fútbol para 2026-07-12 (06:00 Lima = 11:00 UTC).
const firstFutbolSlot = {
  startsAt: '2026-07-12T11:00:00.000Z',
  endsAt: '2026-07-12T12:30:00.000Z',
};

function buildReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: 'res-existing',
    resourceId: 'futbol-1',
    resourceType: 'FUTBOL',
    holderMemberId: 'member-2',
    startsAt: firstFutbolSlot.startsAt,
    endsAt: firstFutbolSlot.endsAt,
    reservationStatus: 'CONFIRMED',
    participantCount: 1,
    guestCount: 0,
    requiresApproval: false,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-07-10T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function buildMaintenanceBlock(overrides: Partial<MaintenanceBlock> = {}): MaintenanceBlock {
  return {
    blockId: 'block-1',
    resourceId: 'futbol-1',
    startsAt: firstFutbolSlot.startsAt,
    endsAt: firstFutbolSlot.endsAt,
    reason: 'Riego',
    createdBy: 'admin-1',
    createdAt: '2026-07-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('getResourceAvailability', () => {
  beforeEach(() => {
    getResourceByIdMock.mockReset();
    findResourceOccupancyMock.mockReset();
  });

  it('devuelve 200 con resourceId, date, blockMinutes, resourceStatus y la lista completa de franjas (criterio 1)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.resourceId).toBe('futbol-1');
    expect(result.date).toBe('2026-07-12');
    expect(result.blockMinutes).toBe(90);
    expect(result.resourceStatus).toBe('AVAILABLE');
    expect(result.slots).toHaveLength(10);
    expect(result.slots.every((slot) => 'startsAt' in slot && 'endsAt' in slot)).toBe(true);
  });

  it('la primera franja empieza en opensAt y la última termina como máximo en closesAt, hora local (criterio 2)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.slots[0]?.startsAt).toBe(firstFutbolSlot.startsAt);
    const last = result.slots[result.slots.length - 1];
    expect(new Date(last!.endsAt).getTime()).toBeLessThanOrEqual(
      new Date('2026-07-13T03:00:00.000Z').getTime(), // 22:00 Lima
    );
  });

  it('la duración de cada franja es exactamente blockMinutes del recurso (criterio 3, parrilla 300 min)', async () => {
    getResourceByIdMock.mockResolvedValue(parrilla1);
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    const result = await getResourceAvailability({
      resourceId: 'parrilla-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.blockMinutes).toBe(300);
    // Franja que cruza closesAt no se ofrece: 10:00 + 2*5h = 20:00 Lima; un
    // tercer bloque cruzaría el cierre (22:00) y no se genera (slots.test.ts).
    expect(result.slots).toHaveLength(2);
    for (const slot of result.slots) {
      const durationMs = new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime();
      expect(durationMs).toBe(300 * 60_000);
    }
  });

  it('una franja ocupada por una reserva activa se devuelve RESERVED/available=false (criterio 4, RN-RES-07)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({
      activeReservations: [buildReservation()],
      maintenanceBlocks: [],
    });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const occupiedSlot = result.slots.find((slot) => slot.startsAt === firstFutbolSlot.startsAt);
    expect(occupiedSlot).toEqual({
      startsAt: firstFutbolSlot.startsAt,
      endsAt: firstFutbolSlot.endsAt,
      available: false,
      status: 'RESERVED',
    });
  });

  it('una franja solapada por un bloqueo de mantenimiento se devuelve MAINTENANCE aunque no haya reserva (criterio 5, RN-RES-11)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({
      activeReservations: [],
      maintenanceBlocks: [buildMaintenanceBlock()],
    });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const blockedSlot = result.slots.find((slot) => slot.startsAt === firstFutbolSlot.startsAt);
    expect(blockedSlot?.status).toBe('MAINTENANCE');
    expect(blockedSlot?.available).toBe(false);
  });

  it('mantenimiento puntual tiene precedencia sobre RESERVED cuando ambos se solapan la misma franja (criterio 5/precedencia)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({
      activeReservations: [buildReservation()],
      maintenanceBlocks: [buildMaintenanceBlock()],
    });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const slot = result.slots.find((s) => s.startsAt === firstFutbolSlot.startsAt);
    expect(slot?.status).toBe('MAINTENANCE');
  });

  it('una reserva PENDING_APPROVAL ocupa la franja (RESERVED); ver repository.test.ts para el filtrado por estado (criterio 6)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({
      // `findResourceOccupancy` (mockeado aquí) ya filtra por
      // `isActiveReservationStatus` antes de devolver el arreglo: lo que
      // llega en `activeReservations` se trata siempre como ocupante,
      // incluido `PENDING_APPROVAL` (aclaración funcional de RN-RES-07).
      activeReservations: [buildReservation({ reservationStatus: 'PENDING_APPROVAL' })],
      maintenanceBlocks: [],
    });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const slot = result.slots.find((s) => s.startsAt === firstFutbolSlot.startsAt);
    expect(slot?.status).toBe('RESERVED');
    expect(slot?.available).toBe(false);
  });

  it('una franja sin reservas activas (CANCELLED/REJECTED ya filtradas por el repositorio) vuelve AVAILABLE (criterio 6)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    // Simula el resultado de `findResourceOccupancy` cuando la única reserva
    // de la franja está CANCELLED/REJECTED: el repositorio ya la excluyó de
    // `activeReservations` (repository.test.ts la cubre), así que aquí llega
    // vacío.
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    const slot = result.slots.find((s) => s.startsAt === firstFutbolSlot.startsAt);
    expect(slot).toEqual({ ...firstFutbolSlot, available: true, status: 'AVAILABLE' });
  });

  it('un recurso con resourceStatus=MAINTENANCE devuelve todas sus franjas MAINTENANCE sin consultar ocupación puntual (criterio 7)', async () => {
    getResourceByIdMock.mockResolvedValue({ ...futbol1, resourceStatus: 'MAINTENANCE' });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.resourceStatus).toBe('MAINTENANCE');
    expect(result.slots).toHaveLength(10);
    expect(
      result.slots.every((slot) => slot.available === false && slot.status === 'MAINTENANCE'),
    ).toBe(true);
    expect(findResourceOccupancyMock).not.toHaveBeenCalled();
  });

  it('las franjas ya pasadas del día en curso se devuelven PAST/available=false (criterio 8)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      // 11:30 UTC del 12/07: posterior al inicio del primer slot (11:00 UTC).
      now: new Date('2026-07-12T11:30:00.000Z'),
    });

    const pastSlot = result.slots.find((slot) => slot.startsAt === firstFutbolSlot.startsAt);
    expect(pastSlot).toEqual({ ...firstFutbolSlot, available: false, status: 'PAST' });
  });

  it('un date con formato inválido devuelve 400 VALIDATION_ERROR sin consultar el recurso (criterio 9)', async () => {
    await expect(
      getResourceAvailability({
        resourceId: 'futbol-1',
        date: '12-07-2026',
        client: fakeClient,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(getResourceByIdMock).not.toHaveBeenCalled();
  });

  it('un resourceId inexistente devuelve 404 NOT_FOUND (criterio 9)', async () => {
    getResourceByIdMock.mockResolvedValue(undefined);

    await expect(
      getResourceAvailability({
        resourceId: 'no-existe',
        date: '2026-07-12',
        client: fakeClient,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('un día completo sin franjas libres devuelve 200 con todas las franjas available=false (caso alternativo)', async () => {
    getResourceByIdMock.mockResolvedValue(futbol1);
    findResourceOccupancyMock.mockResolvedValue({
      // Una sola reserva que cubre exactamente todo el horario operativo
      // (06:00-22:00 Lima) ocupa los 10 slots del día.
      activeReservations: [
        buildReservation({
          startsAt: '2026-07-12T11:00:00.000Z',
          endsAt: '2026-07-13T03:00:00.000Z',
        }),
      ],
      maintenanceBlocks: [],
    });

    const result = await getResourceAvailability({
      resourceId: 'futbol-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(result.slots).toHaveLength(10);
    expect(result.slots.every((slot) => slot.available === false)).toBe(true);
  });

  it('consulta la ocupación en una sola llamada por día, acotada a [opensAt, closesAt] en UTC', async () => {
    getResourceByIdMock.mockResolvedValue(parrilla1);
    findResourceOccupancyMock.mockResolvedValue({ activeReservations: [], maintenanceBlocks: [] });

    await getResourceAvailability({
      resourceId: 'parrilla-1',
      date: '2026-07-12',
      client: fakeClient,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    expect(findResourceOccupancyMock).toHaveBeenCalledTimes(1);
    expect(findResourceOccupancyMock).toHaveBeenCalledWith(fakeClient, 'parrilla-1', {
      from: '2026-07-12T15:00:00.000Z', // 10:00 Lima
      to: '2026-07-13T03:00:00.000Z', // 22:00 Lima, cambio de día UTC
    });
  });
});
