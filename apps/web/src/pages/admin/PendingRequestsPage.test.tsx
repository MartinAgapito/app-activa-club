import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Member, MemberSummary, Paginated } from '@activa-club/shared-types';
import { PendingRequestsPage } from './PendingRequestsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchPendingMembersMock, fetchMemberDetailMock, approveMemberMock, rejectMemberMock } =
  vi.hoisted(() => ({
    fetchPendingMembersMock: vi.fn(),
    fetchMemberDetailMock: vi.fn(),
    approveMemberMock: vi.fn(),
    rejectMemberMock: vi.fn(),
  }));

vi.mock('../../admin/pending-members-client', () => ({
  fetchPendingMembers: fetchPendingMembersMock,
  fetchMemberDetail: fetchMemberDetailMock,
  approveMember: approveMemberMock,
  rejectMember: rejectMemberMock,
}));

const MEMBER_A_SUMMARY: MemberSummary = {
  memberId: 'member-a',
  dni: '10203040',
  firstName: 'Juan',
  lastName: 'Pérez',
  origin: 'NEW',
  memberStatus: 'PENDING',
  membershipStatus: 'NONE',
  createdAt: '2026-07-01T00:00:00Z',
};

const MEMBER_B_SUMMARY: MemberSummary = {
  memberId: 'member-b',
  dni: '50607080',
  firstName: 'Ana',
  lastName: 'Gómez',
  origin: 'NEW',
  memberStatus: 'PENDING',
  membershipStatus: 'NONE',
  createdAt: '2026-07-02T00:00:00Z',
};

const MEMBER_A_DETAIL: Member = {
  memberId: 'member-a',
  legacyId: null,
  dni: '10203040',
  email: 'juan.perez@example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '999111222',
  origin: 'NEW',
  memberStatus: 'PENDING',
  cognitoSub: 'sub-a',
  rejectionReason: null,
  membershipType: null,
  membershipStatus: 'NONE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

function page(items: MemberSummary[], nextCursor: string | null = null): Paginated<MemberSummary> {
  return { items, nextCursor };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PendingRequestsPage />
    </QueryClientProvider>,
  );
}

describe('PendingRequestsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchPendingMembersMock.mockReset();
    fetchMemberDetailMock.mockReset();
    approveMemberMock.mockReset();
    rejectMemberMock.mockReset();
  });

  it('muestra un estado de carga mientras obtiene la lista', () => {
    fetchPendingMembersMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Cargando solicitudes…')).toBeInTheDocument();
  });

  it('lista las solicitudes pendientes con datos suficientes para decidir (criterio 1)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY, MEMBER_B_SUMMARY]));
    renderPage();

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('DNI 10203040')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(fetchPendingMembersMock).toHaveBeenCalledWith(null);
  });

  it('muestra un estado vacío cuando no hay solicitudes pendientes', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([]));
    renderPage();

    expect(await screen.findByText('No hay solicitudes pendientes')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintento si falla la carga de la lista', async () => {
    fetchPendingMembersMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    renderPage();

    expect(await screen.findByText('No pudimos cargar las solicitudes')).toBeInTheDocument();

    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
  });

  it('carga más solicitudes al usar la paginación por cursor', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY], 'cursor-2'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    const loadMoreButton = screen.getByRole('button', { name: 'Cargar más' });

    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_B_SUMMARY], null));
    await user.click(loadMoreButton);

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(fetchPendingMembersMock).toHaveBeenCalledWith('cursor-2');
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('muestra el detalle de la solicitud seleccionada, incluyendo el correo (criterio 2)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));

    expect(await screen.findByText('juan.perez@example.com')).toBeInTheDocument();
    expect(fetchMemberDetailMock).toHaveBeenCalledWith('member-a');
    expect(
      screen.getByText('Solicitud pendiente de aprobación', { selector: 'span' }),
    ).toBeInTheDocument();
  });

  it('aprueba una solicitud tras confirmar y refleja el nuevo estado (criterio 3)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    approveMemberMock.mockResolvedValueOnce({ memberId: 'member-a', memberStatus: 'APPROVED' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));
    await screen.findByText('juan.perez@example.com');

    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('¿Aprobar a Juan Pérez?')).toBeInTheDocument();

    fetchMemberDetailMock.mockResolvedValueOnce({
      ...MEMBER_A_DETAIL,
      memberStatus: 'APPROVED',
    });
    fetchPendingMembersMock.mockResolvedValueOnce(page([]));

    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(approveMemberMock).toHaveBeenCalledWith('member-a');
    expect(await screen.findByText('Solicitud aprobada correctamente.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMemberDetailMock).toHaveBeenCalledTimes(2));
  });

  it('exige un motivo antes de habilitar la confirmación de rechazo (caso alternativo)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    rejectMemberMock.mockResolvedValueOnce({ memberId: 'member-a', memberStatus: 'REJECTED' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));
    await screen.findByText('juan.perez@example.com');

    await user.click(screen.getByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Rechazar' });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/motivo del rechazo/i), 'Datos no verificables');
    expect(confirmButton).toBeEnabled();

    fetchMemberDetailMock.mockResolvedValueOnce({
      ...MEMBER_A_DETAIL,
      memberStatus: 'REJECTED',
      rejectionReason: 'Datos no verificables',
    });
    fetchPendingMembersMock.mockResolvedValueOnce(page([]));

    await user.click(confirmButton);

    expect(rejectMemberMock).toHaveBeenCalledWith('member-a', { reason: 'Datos no verificables' });
    expect(await screen.findByText('Solicitud rechazada correctamente.')).toBeInTheDocument();
  });

  it('muestra un mensaje claro y refresca el estado ante un conflicto 409 (caso alternativo)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    approveMemberMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'CONFLICT', 'La solicitud ya no está pendiente.'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));
    await screen.findByText('juan.perez@example.com');

    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('alertdialog');

    fetchMemberDetailMock.mockResolvedValueOnce({
      ...MEMBER_A_DETAIL,
      memberStatus: 'REJECTED',
      rejectionReason: 'Rechazado por otro administrador',
    });
    fetchPendingMembersMock.mockResolvedValueOnce(page([]));

    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(
      await screen.findByText(/otro administrador ya actualizó esta solicitud/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMemberDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fetchPendingMembersMock).toHaveBeenCalledTimes(2));
  });
});
