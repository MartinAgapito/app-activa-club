// Inicio del administrador (US-071): integra los bloques con sus fuentes y
// comprueba que cada uno falla de forma independiente.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminDashboard, AdminReservationListItem } from '@activa-club/shared-types';
import { AdminDashboardPage } from './AdminDashboardPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchDashboardMock, listMock, fetchResourcesMock } = vi.hoisted(() => ({
  fetchDashboardMock: vi.fn(),
  listMock: vi.fn(),
  fetchResourcesMock: vi.fn(),
}));

vi.mock('../../admin/dashboard/admin-dashboard-client', () => ({
  fetchAdminDashboard: fetchDashboardMock,
}));

vi.mock('../../admin/reservations/admin-reservations-client', () => ({
  ADMIN_RESERVATIONS_PAGE_SIZE: 20,
  listAdminReservations: listMock,
}));

vi.mock('../../reservations/my-reservations-client', () => ({
  fetchReservationDetail: vi.fn(),
  cancelReservation: vi.fn(),
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

const PERIOD = {
  from: '2026-10-01T05:00:00.000Z',
  to: '2026-11-01T05:00:00.000Z',
  timeZone: 'America/Lima',
} as const;

const DASHBOARD: AdminDashboard = {
  periods: { currentMonth: PERIOD, last30Days: { ...PERIOD } },
  membersByStatus: { ACTIVE: 70, MIGRATED: 40, PENDING: 3, REJECTED: 1 },
  membershipsExpiringSoon: 8,
  reservationsByResource: {},
  reservationsByDay: [],
  reservationsByHour: [],
  pendingApprovals: 4,
  payments: { succeeded: 55, failed: 3 },
  occupancy: [],
  notificationsSent: 14,
};

const EMPTY_DASHBOARD: AdminDashboard = {
  ...DASHBOARD,
  membersByStatus: {},
  membershipsExpiringSoon: 0,
  pendingApprovals: 0,
  payments: { succeeded: 0, failed: 0 },
  notificationsSent: 0,
};

const RESERVATION: AdminReservationListItem = {
  reservationId: 'res-1',
  resourceId: 'parrilla-1',
  resourceType: 'PARRILLA',
  holderMemberId: 'm-1',
  startsAt: '2099-07-20T15:00:00Z',
  endsAt: '2099-07-20T20:00:00Z',
  reservationStatus: 'PENDING_APPROVAL',
  participantCount: 4,
  guestCount: 0,
  requiresApproval: true,
  rejectionReason: null,
  cancelledAt: null,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
  holder: { memberId: 'm-1', firstName: 'Ana', lastName: 'Torres' },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminDashboardPage', () => {
  it('muestra cantidades y la tabla de reservas por aprobar', async () => {
    fetchDashboardMock.mockResolvedValue(DASHBOARD);
    listMock.mockResolvedValue({ items: [RESERVATION], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([
      {
        resourceId: 'parrilla-1',
        type: 'PARRILLA',
        name: 'Parrilla 1',
        capacity: 20,
        blockMinutes: 300,
        opensAt: '08:00',
        closesAt: '23:00',
        requiresApproval: true,
        resourceStatus: 'AVAILABLE',
      },
    ]);
    renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Panel de administración' }),
    ).toBeInTheDocument();
    const attention = screen.getByRole('region', { name: 'Requiere tu atención' });
    expect(await within(attention).findByText('3 solicitudes')).toBeInTheDocument();
    expect(await within(attention).findByText('4 reservas')).toBeInTheDocument();
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(await screen.findByText('Parrilla 1')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING_APPROVAL' }));
  });

  it('si falla el dashboard, la tabla de reservas por aprobar se muestra igual', async () => {
    fetchDashboardMock.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Error'));
    listMock.mockResolvedValue({ items: [RESERVATION], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();

    const attention = screen.getByRole('region', { name: 'Requiere tu atención' });
    expect(await screen.findByText('No pudimos cargar el resumen del club.')).toBeVisible();
    expect(
      await within(attention).findAllByText('No pudimos cargar esta información.'),
    ).toHaveLength(2);
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
  });

  it('sin pendientes muestra "Todo al día" sin error', async () => {
    fetchDashboardMock.mockResolvedValue(EMPTY_DASHBOARD);
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no hay nada esperando tu decisión/i)).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: 'Resumen del club' });
    expect(
      await within(summary).findByText('Total de socios: 0. Cifras al momento de la consulta.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('muestra el resumen del club con período en hora de Lima y accesos con su filtro', async () => {
    fetchDashboardMock.mockResolvedValue(DASHBOARD);
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();

    const summary = screen.getByRole('region', { name: 'Resumen del club' });
    expect(
      await within(summary).findByText('Total de socios: 114. Cifras al momento de la consulta.'),
    ).toBeInTheDocument();
    expect(
      within(summary).getAllByText('Del 1 al 31 de octubre de 2026 (hora de Lima).'),
    ).toHaveLength(2);
    expect(within(summary).getByText('55')).toBeInTheDocument();
    expect(within(summary).getByText('14')).toBeInTheDocument();
    expect(within(summary).getByText('Requiere atención')).toBeInTheDocument();

    const link = (name: string) => within(summary).getByRole('link', { name });
    expect(link('Ver socios: Rechazados')).toHaveAttribute('href', '/admin/socios?tab=rechazados');
    expect(link('Ver por vencer: Membresías por vencer')).toHaveAttribute(
      'href',
      '/admin/socios?tab=activos&membresia=EXPIRING_SOON',
    );
    expect(link('Ver pagos: Pagos fallidos')).toHaveAttribute(
      'href',
      '/admin/membresias?estado=FAILED',
    );
    expect(link('Ver historial: Notificaciones enviadas')).toHaveAttribute(
      'href',
      '/admin/notificaciones?tab=enviadas',
    );
    expect(link('Ir a Analítica')).toHaveAttribute('href', '/admin/analytics');
  });
});
