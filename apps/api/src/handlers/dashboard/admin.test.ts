import { beforeEach, describe, expect, it, vi } from 'vitest';

const computeMock = vi.fn();
vi.mock('../../dashboard/admin-people-metrics', () => ({
  computeAdminPeopleMetrics: computeMock,
}));
const reservationsMock = vi.fn();
vi.mock('../../dashboard/admin-reservation-metrics', () => ({
  getAdminReservationMetrics: reservationsMock,
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./admin');

function buildEvent(claims?: Record<string, string>) {
  return buildCognitoProxyEvent({
    httpMethod: 'GET',
    path: '/dashboard/admin',
    queryStringParameters: null,
    claims: claims ?? { sub: 'admin-sub', 'cognito:groups': '[admin]' },
  });
}

const people = {
  periods: {
    currentMonth: {
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-11-01T05:00:00.000Z',
      timeZone: 'America/Lima',
    },
  },
  membersByStatus: { MIGRATED: 1, PENDING: 0, APPROVED: 0, REJECTED: 0, ACTIVE: 2 },
  membershipsExpiringSoon: 1,
  pendingApprovals: 0,
  payments: { succeeded: 3, failed: 1 },
  notificationsSent: 4,
};

const reservations = {
  periods: {
    currentMonth: people.periods.currentMonth,
    last30Days: {
      from: '2026-09-13T05:00:00.000Z',
      to: '2026-10-13T05:00:00.000Z',
      timeZone: 'America/Lima',
    },
  },
  reservationsByResource: { 'futbol-1': 2 },
  reservationsByDay: [{ date: '2026-10-01', count: 2 }],
  reservationsByHour: [{ hour: '06:00', count: 2 }],
  occupancy: [
    { resourceId: 'futbol-1', occupancyRate: 0.0063, reservedHours: 3, operatingHours: 480 },
  ],
};

describe('GET /dashboard/admin', () => {
  beforeEach(() => {
    computeMock.mockReset();
    computeMock.mockResolvedValue(people);
    reservationsMock.mockReset();
    reservationsMock.mockResolvedValue(reservations);
  });

  it('200 con las secciones de US-057 y US-058 y los dos periodos', async () => {
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      ...people,
      ...reservations,
      periods: reservations.periods,
    });
  });

  it('403 para un member sin consultar nada', async () => {
    const result = await handler(buildEvent({ sub: 'm', 'cognito:groups': '[member]' }));
    expect(result.statusCode).toBe(403);
    expect(computeMock).not.toHaveBeenCalled();
  });

  it('401 sin identidad', async () => {
    expect((await handler(buildEvent({}))).statusCode).toBe(401);
  });

  it('500 genérico si falla DynamoDB, sin filtrar el detalle', async () => {
    computeMock.mockRejectedValue(new Error('tabla secreta'));
    const result = await handler(buildEvent());
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('tabla secreta');
  });
});
