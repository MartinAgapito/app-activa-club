// Inicio del administrador (US-071): integra los bloques con sus fuentes y
// comprueba que cada uno falla de forma independiente.

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminReservationListItem, MemberSummary } from '@activa-club/shared-types';
import { AdminDashboardPage } from './AdminDashboardPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchPendingMembersMock, listMock, fetchResourcesMock } = vi.hoisted(() => ({
  fetchPendingMembersMock: vi.fn(),
  listMock: vi.fn(),
  fetchResourcesMock: vi.fn(),
}));

vi.mock('../../admin/pending-members-client', () => ({
  fetchPendingMembers: fetchPendingMembersMock,
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

const MEMBER: MemberSummary = {
  memberId: 'member-a',
  dni: '10203040',
  firstName: 'Juan',
  lastName: 'Pérez',
  origin: 'NEW',
  memberStatus: 'PENDING',
  membershipStatus: 'NONE',
  createdAt: '2026-07-01T00:00:00Z',
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
    fetchPendingMembersMock.mockResolvedValue({ items: [MEMBER], nextCursor: null });
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
    expect(await within(attention).findByText('1 solicitud')).toBeInTheDocument();
    expect(await within(attention).findByText('1 reserva')).toBeInTheDocument();
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
    expect(await screen.findByText('Parrilla 1')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING_APPROVAL' }));
  });

  it('si fallan las solicitudes, el bloque de reservas se muestra igual', async () => {
    fetchPendingMembersMock.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'Error'));
    listMock.mockResolvedValue({ items: [RESERVATION], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();

    const attention = screen.getByRole('region', { name: 'Requiere tu atención' });
    expect(await within(attention).findByText('No pudimos cargar esta información.')).toBeVisible();
    expect(await within(attention).findByText('1 reserva')).toBeInTheDocument();
    expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
  });

  it('sin pendientes muestra "Todo al día" sin error', async () => {
    fetchPendingMembersMock.mockResolvedValue({ items: [], nextCursor: null });
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/no hay nada esperando tu decisión/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
