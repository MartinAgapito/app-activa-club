import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
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

function LocationProbe() {
  return <p data-testid="location-search">{useLocation().search}</p>;
}

function renderPage(initialEntry = '/admin/solicitudes') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <PendingRequestsPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Abre la solicitud de Juan Pérez desde la tabla y devuelve el panel. */
async function openPanelA(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('Juan Pérez'));
  const panel = await screen.findByRole('dialog', { name: 'Juan Pérez' });
  await within(panel).findByText('juan.perez@example.com');
  return panel;
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

  it('lista las solicitudes pendientes en una tabla con nombre, DNI y fecha (criterio 1)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY, MEMBER_B_SUMMARY]));
    renderPage();

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'DNI' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fecha de solicitud' })).toBeInTheDocument();
    expect(screen.getByText('10203040')).toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(fetchPendingMembersMock).toHaveBeenCalledWith(null);
    // El correo solo se ve en el detalle.
    expect(screen.queryByText('juan.perez@example.com')).not.toBeInTheDocument();
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

  it('abre el panel con el detalle, incluyendo el correo, y fija la dirección propia (criterio 2)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);

    expect(fetchMemberDetailMock).toHaveBeenCalledWith('member-a');
    expect(within(panel).getByText('999111222')).toBeInTheDocument();
    expect(within(panel).getByText('Datos de contacto')).toBeInTheDocument();
    expect(within(panel).getByText('Datos de registro')).toBeInTheDocument();
    expect(within(panel).getByText('Solicitud pendiente de aprobación')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?solicitud=member-a');
  });

  it('abre el panel al entrar directamente con ?solicitud=<id>', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    renderPage('/admin/solicitudes?solicitud=member-a');

    const panel = await screen.findByRole('dialog', { name: 'Juan Pérez' });
    expect(await within(panel).findByText('juan.perez@example.com')).toBeInTheDocument();
    expect(fetchMemberDetailMock).toHaveBeenCalledWith('member-a');
  });

  it('muestra un error con reintento si falla el detalle', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));
    expect(await screen.findByText('No pudimos cargar esta solicitud')).toBeInTheDocument();

    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('juan.perez@example.com')).toBeInTheDocument();
  });

  it('aprueba tras confirmar: cierra panel y ventana, quita la fila y avisa (criterios 4 y 6)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY, MEMBER_B_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValue(MEMBER_A_DETAIL);
    approveMemberMock.mockResolvedValueOnce({ memberId: 'member-a', memberStatus: 'APPROVED' });
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    await user.click(within(panel).getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('¿Aprobar a Juan Pérez?')).toBeInTheDocument();
    expect(within(dialog).getByText(/deberá pagar su primera membresía/i)).toBeInTheDocument();

    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_B_SUMMARY]));
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(approveMemberMock).toHaveBeenCalledWith('member-a');
    expect(await screen.findByText('Solicitud aprobada')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Ana Gómez')).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
    await waitFor(() => expect(fetchPendingMembersMock).toHaveBeenCalledTimes(2));
  });

  it('exige un motivo antes de habilitar el rechazo y avisa al rechazar (criterios 5 y 6)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValue(MEMBER_A_DETAIL);
    rejectMemberMock.mockResolvedValueOnce({ memberId: 'member-a', memberStatus: 'REJECTED' });
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    await user.click(within(panel).getByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirmButton = within(dialog).getByRole('button', { name: 'Rechazar' });
    expect(confirmButton).toBeDisabled();

    await user.type(within(dialog).getByLabelText(/motivo del rechazo/i), 'Datos no verificables');
    expect(confirmButton).toBeEnabled();

    fetchPendingMembersMock.mockResolvedValueOnce(page([]));
    await user.click(confirmButton);

    expect(rejectMemberMock).toHaveBeenCalledWith('member-a', { reason: 'Datos no verificables' });
    expect(await screen.findByText('Solicitud rechazada')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('No hay solicitudes pendientes')).toBeInTheDocument();
  });

  it('mantiene deshabilitado el rechazo con un motivo solo de espacios', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValue(MEMBER_A_DETAIL);
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    await user.click(within(panel).getByRole('button', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('alertdialog');

    await user.type(within(dialog).getByLabelText(/motivo del rechazo/i), '   ');
    expect(within(dialog).getByRole('button', { name: 'Rechazar' })).toBeDisabled();
    expect(rejectMemberMock).not.toHaveBeenCalled();
  });

  it('traduce el conflicto 409 dentro de la ventana y refresca la lista al cerrarla (criterio 7)', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    approveMemberMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'CONFLICT', 'La solicitud ya no está pendiente.'),
    );
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    await user.click(within(panel).getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(
      await within(dialog).findByText(/otro administrador ya actualizó esta solicitud/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Aprobar' })).toBeDisabled();
    // Todavía no se refrescó: ocurre al cerrar la ventana.
    expect(fetchPendingMembersMock).toHaveBeenCalledTimes(1);

    fetchMemberDetailMock.mockResolvedValueOnce({
      ...MEMBER_A_DETAIL,
      memberStatus: 'REJECTED',
      rejectionReason: 'Rechazado por otro administrador',
    });
    fetchPendingMembersMock.mockResolvedValueOnce(page([]));
    await user.click(within(dialog).getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(fetchMemberDetailMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fetchPendingMembersMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Rechazado por otro administrador')).toBeInTheDocument();
    expect(
      screen.getByText('Esta solicitud ya fue resuelta y no admite más acciones.'),
    ).toBeInTheDocument();
  });

  it('muestra dentro de la ventana un error genérico y permite reintentar', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValue(MEMBER_A_DETAIL);
    approveMemberMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    await user.click(within(panel).getByRole('button', { name: 'Aprobar' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(await within(dialog).findByText('Ocurrió un error interno.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Aprobar' })).toBeEnabled();
  });

  it('devuelve el foco a la fila al cerrar el panel', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    const user = userEvent.setup();
    renderPage();

    const row = await screen.findByRole('row', { name: /Juan Pérez/ });
    await user.click(row);
    await screen.findByRole('dialog', { name: 'Juan Pérez' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(row).toHaveFocus());
    expect(screen.getByTestId('location-search')).toHaveTextContent('');
  });

  it('devuelve el foco al botón del panel al cancelar la ventana de rechazo', async () => {
    fetchPendingMembersMock.mockResolvedValueOnce(page([MEMBER_A_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(MEMBER_A_DETAIL);
    const user = userEvent.setup();
    renderPage();

    const panel = await openPanelA(user);
    const rejectButton = within(panel).getByRole('button', { name: 'Rechazar' });
    await user.click(rejectButton);
    const dialog = await screen.findByRole('alertdialog');

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(rejectButton).toHaveFocus());
    expect(rejectMemberMock).not.toHaveBeenCalled();
  });
});
