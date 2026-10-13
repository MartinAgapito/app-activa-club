import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAdminReservationMetricsMock = vi.fn();
vi.mock('../../dashboard/admin-reservation-metrics', () => ({
  getAdminReservationMetrics: getAdminReservationMetricsMock,
}));

const { buildCognitoProxyEvent } = await import('../../testing/fixtures');
const { handler } = await import('./admin');

const sample = {
  periods: {
    currentMonth: {
      from: '2026-10-01T05:00:00.000Z',
      to: '2026-11-01T05:00:00.000Z',
      timeZone: 'America/Lima',
    },
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

function buildEvent(claims: Record<string, string>) {
  return buildCognitoProxyEvent({ httpMethod: 'GET', path: '/dashboard/admin', claims });
}

describe('GET /dashboard/admin (sección de reservas y ocupación, US-058)', () => {
  beforeEach(() => {
    getAdminReservationMetricsMock.mockReset();
  });

  it('devuelve 403 si el rol es member', async () => {
    const result = await handler(buildEvent({ sub: 'm', 'cognito:groups': '[member]' }));

    expect(result.statusCode).toBe(403);
    expect(getAdminReservationMetricsMock).not.toHaveBeenCalled();
  });

  it('devuelve 401 sin identidad', async () => {
    const event = buildEvent({ sub: 'a', 'cognito:groups': '[admin]' });
    (event.requestContext.authorizer as { claims?: unknown }).claims = undefined;

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
  });

  it('responde 200 con las métricas para admin', async () => {
    getAdminReservationMetricsMock.mockResolvedValue(sample);

    const result = await handler(buildEvent({ sub: 'a', 'cognito:groups': '[admin]' }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual(sample);
  });
});
