// Analítica de reservas y ocupación (US-060): cifras del gráfico y de la tabla
// alternativa, nombres legibles, periodo en hora de Lima y estados.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminDashboard, Resource } from '@activa-club/shared-types';
import { AnalyticsPage } from './AnalyticsPage';
import { ApiRequestError } from '../../lib/api/http-client';
import { addDaysToDate } from '../../lib/format/lima-time';

const { fetchDashboardMock, fetchResourcesMock } = vi.hoisted(() => ({
  fetchDashboardMock: vi.fn(),
  fetchResourcesMock: vi.fn(),
}));

vi.mock('../../analytics/admin-dashboard-client', () => ({
  fetchAdminDashboard: fetchDashboardMock,
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

function resource(resourceId: string, name: string): Resource {
  return {
    resourceId,
    type: 'FUTBOL',
    name,
    capacity: 10,
    blockMinutes: 90,
    opensAt: '06:00',
    closesAt: '22:00',
    requiresApproval: false,
    resourceStatus: 'AVAILABLE',
  };
}

const CATALOG = [
  resource('futbol-1', 'Cancha de fútbol 1'),
  resource('piscina-1', 'Piscina'),
  resource('tenis-1', 'Cancha de tenis 1'),
];

function dashboard(overrides: Partial<AdminDashboard> = {}): AdminDashboard {
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: addDaysToDate('2026-09-13', i),
    count: i === 4 ? 9 : 1,
  }));
  return {
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
    membersByStatus: {},
    membershipsExpiringSoon: 0,
    reservationsByResource: { 'futbol-1': 12, 'piscina-1': 20, 'tenis-1': 0 },
    reservationsByDay: days,
    reservationsByHour: [
      { hour: '06:00', count: 2 },
      { hour: '07:00', count: 25 },
      { hour: '08:00', count: 5 },
    ],
    pendingApprovals: 0,
    payments: { succeeded: 0, failed: 0 },
    occupancy: [
      { resourceId: 'futbol-1', occupancyRate: 0.62, reservedHours: 297, operatingHours: 479 },
      { resourceId: 'piscina-1', occupancyRate: 0.8, reservedHours: 20.5, operatingHours: 25.63 },
      { resourceId: 'tenis-1', occupancyRate: 0, reservedHours: 0, operatingHours: 480 },
    ],
    notificationsSent: 0,
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('AnalyticsPage', () => {
  it('muestra el estado de carga mientras llegan las cifras', () => {
    fetchDashboardMock.mockReturnValue(new Promise(() => undefined));
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la analítica');
  });

  it('muestra el periodo en hora de Lima', async () => {
    fetchDashboardMock.mockResolvedValue(dashboard());
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    expect(
      await screen.findByText(/13 de setiembre de 2026 al 12 de octubre de 2026/),
    ).toBeInTheDocument();
    expect(screen.getByText(/hora de Lima/)).toBeInTheDocument();
  });

  it('ordena las reservas por instalación de mayor a menor con nombre legible', async () => {
    fetchDashboardMock.mockResolvedValue(dashboard());
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    const list = await screen.findByRole('list', { name: /Reservas por instalación/ });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Piscina20 reservas',
      'Cancha de fútbol 112 reservas',
      'Cancha de tenis 10 reservas',
    ]);
    expect(screen.queryByText('futbol-1')).not.toBeInTheDocument();
  });

  it('muestra la ocupación como porcentaje con las horas que la explican', async () => {
    fetchDashboardMock.mockResolvedValue(dashboard());
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    const futbolRow = (await screen.findAllByText('Cancha de fútbol 1'))
      .map((el) => el.closest('tr'))
      .find((tr) => tr !== null)!;
    expect(within(futbolRow).getByText(/62\s?%/)).toBeInTheDocument();
    expect(within(futbolRow).getByText('297 h')).toBeInTheDocument();
    expect(within(futbolRow).getByText('479 h')).toBeInTheDocument();
  });

  it('ofrece los datos por día y por hora en tablas con las mismas cifras', async () => {
    const user = userEvent.setup();
    fetchDashboardMock.mockResolvedValue(dashboard());
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    await screen.findByText('Reservas por horario');

    expect(screen.getByText(/Día con más reservas: 17 set \(9\)/)).toBeInTheDocument();
    expect(screen.getByText(/Hora con más reservas: 07:00 \(25\)/)).toBeInTheDocument();

    const summaries = screen.getAllByText('Ver los datos en tabla');
    await user.click(summaries[1]!);
    const hours = screen.getByRole('table', { name: /Reservas por hora/ });
    expect(within(hours).getByRole('row', { name: /07:00 25/ })).toBeInTheDocument();
    expect(within(hours).getAllByRole('row')).toHaveLength(4);

    const days = screen.getByRole('table', { name: /Reservas por día/, hidden: true });
    expect(within(days).getAllByRole('row', { hidden: true })).toHaveLength(31);
    expect(screen.getAllByTestId('chart-column')).toHaveLength(33);
  });

  it('muestra el estado vacío cuando no hay reservas en el periodo', async () => {
    fetchDashboardMock.mockResolvedValue(
      dashboard({
        reservationsByResource: { 'futbol-1': 0, 'piscina-1': 0 },
      }),
    );
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();
    expect(await screen.findByText('Todavía no hay reservas en el período')).toBeInTheDocument();
    expect(screen.getByText(/Periodo:/)).toBeInTheDocument();
  });

  it('muestra el error y permite reintentar', async () => {
    const user = userEvent.setup();
    fetchDashboardMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Fallo interno'),
    );
    fetchDashboardMock.mockResolvedValueOnce(dashboard());
    fetchResourcesMock.mockResolvedValue(CATALOG);
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar la analítica');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Reservas por horario')).toBeInTheDocument();
    expect(fetchDashboardMock).toHaveBeenCalledTimes(2);
  });
});
