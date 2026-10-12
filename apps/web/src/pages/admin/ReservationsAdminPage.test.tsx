// Reservas y aprobaciones (US-077; conserva los casos de US-034 y US-036):
// pestañas en la URL, tabla de pendientes, panel de detalle, aprobar,
// rechazar con motivo, cancelar, filtros, paginación y errores del contrato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  AdminReservationListItem,
  ReservationDetail,
  Resource,
} from '@activa-club/shared-types';
import { ReservationsAdminPage } from './ReservationsAdminPage';
import { ApiRequestError } from '../../lib/api/http-client';

const {
  listMock,
  approveMock,
  rejectMock,
  detailMock,
  cancelMock,
  fetchResourcesMock,
  signOutMock,
} = vi.hoisted(() => ({
  listMock: vi.fn(),
  approveMock: vi.fn(),
  rejectMock: vi.fn(),
  detailMock: vi.fn(),
  cancelMock: vi.fn(),
  fetchResourcesMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../admin/reservations/admin-reservations-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../admin/reservations/admin-reservations-client')>()),
  listAdminReservations: listMock,
  approveReservation: approveMock,
  rejectReservation: rejectMock,
}));

vi.mock('../../reservations/my-reservations-client', () => ({
  MY_RESERVATIONS_PAGE_SIZE: 20,
  listMyReservations: vi.fn(),
  fetchReservationDetail: detailMock,
  cancelReservation: cancelMock,
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

const NOW = new Date('2026-07-10T12:00:00Z');

const PARRILLA: Resource = {
  resourceId: 'parrilla-1',
  type: 'PARRILLA',
  name: 'Parrilla 1',
  capacity: 20,
  blockMinutes: 300,
  opensAt: '08:00',
  closesAt: '23:00',
  requiresApproval: true,
  resourceStatus: 'AVAILABLE',
};

const FUTBOL: Resource = {
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

function item(overrides: Partial<AdminReservationListItem> = {}): AdminReservationListItem {
  return {
    reservationId: 'res-1',
    resourceId: 'parrilla-1',
    resourceType: 'PARRILLA',
    holderMemberId: 'm-1',
    // 15:00Z = 10:00 en Lima.
    startsAt: '2026-07-20T15:00:00Z',
    endsAt: '2026-07-20T20:00:00Z',
    reservationStatus: 'PENDING_APPROVAL',
    participantCount: 4,
    guestCount: 2,
    requiresApproval: true,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    holder: { memberId: 'm-1', firstName: 'Ana', lastName: 'Torres' },
    ...overrides,
  };
}

function detail(overrides: Partial<ReservationDetail> = {}): ReservationDetail {
  const { holder: _holder, ...base } = item();
  void _holder;
  return {
    ...base,
    participants: [
      {
        participantId: 'p-1',
        reservationId: 'res-1',
        participantType: 'HOLDER',
        memberId: 'm-1',
        guestDni: null,
        guestName: null,
        startsAt: base.startsAt,
        endsAt: base.endsAt,
      },
      {
        participantId: 'p-2',
        reservationId: 'res-1',
        participantType: 'GUEST',
        memberId: null,
        guestDni: '70605040',
        guestName: 'Luis Quispe',
        startsAt: base.startsAt,
        endsAt: base.endsAt,
      },
    ],
    ...overrides,
  };
}

function LocationDisplay() {
  const location = useLocation();
  return <p data-testid="location">{location.search}</p>;
}

function renderPage(initialEntry = '/admin/reservas') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ReservationsAdminPage />
          <LocationDisplay />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function openAllTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Todas' }));
}

/** Filas del cuerpo de la tabla (sin la fila de encabezados). */
function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

async function openFirstRow(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('table');
  await user.click(bodyRows()[0]!);
}

describe('ReservationsAdminPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    fetchResourcesMock.mockResolvedValue([PARRILLA, FUTBOL]);
    listMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('pestañas', () => {
    it('abre "Por aprobar" por defecto y muestra el contador en la pestaña', async () => {
      listMock.mockResolvedValue({
        items: [item(), item({ reservationId: 'res-2' })],
        nextCursor: null,
      });
      renderPage();

      const tab = await screen.findByRole('tab', { name: /Por aprobar/ });
      expect(tab).toHaveAttribute('aria-selected', 'true');
      await waitFor(() => expect(tab).toHaveTextContent('2'));
      expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'false');
    });

    it('guarda la pestaña activa en la URL y la restaura al abrir la dirección', async () => {
      const user = userEvent.setup();
      renderPage();
      await openAllTab(user);
      expect(screen.getByTestId('location')).toHaveTextContent('tab=todas');
      expect(await screen.findByLabelText('Estado')).toBeInTheDocument();
    });

    it('abre directamente "Todas" con ?tab=todas', async () => {
      renderPage('/admin/reservas?tab=todas');
      expect(await screen.findByRole('form', { name: 'Filtros de reservas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');
    });

    it('permite cambiar de pestaña con el teclado', async () => {
      const user = userEvent.setup();
      renderPage();
      const first = await screen.findByRole('tab', { name: /Por aprobar/ });
      first.focus();
      await user.keyboard('{ArrowRight}');
      expect(screen.getByRole('tab', { name: 'Todas' })).toHaveFocus();
    });
  });

  describe('por aprobar', () => {
    it('muestra el estado de carga', () => {
      listMock.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(screen.getByText('Cargando solicitudes pendientes…')).toBeInTheDocument();
    });

    it('pide por defecto status=PENDING_APPROVAL', async () => {
      renderPage();
      await screen.findByText('No hay solicitudes pendientes');
      expect(listMock).toHaveBeenCalledWith({ status: 'PENDING_APPROVAL', cursor: null });
    });

    it('muestra el estado vacío', async () => {
      renderPage();
      expect(await screen.findByText('No hay solicitudes pendientes')).toBeInTheDocument();
      expect(screen.getByText('Sin solicitudes pendientes')).toBeInTheDocument();
    });

    it('muestra contador, instalación, hora de Lima, titular, participantes y antigüedad', async () => {
      listMock.mockResolvedValue({
        items: [
          item(),
          item({ reservationId: 'res-2', startsAt: '2026-07-21T15:00:00Z', guestCount: 0 }),
        ],
        nextCursor: null,
      });
      renderPage();

      expect(await screen.findByText('2 solicitudes pendientes')).toBeInTheDocument();
      const rows = bodyRows();
      expect(rows).toHaveLength(2);
      const first = rows[0]!;
      expect(within(first).getByText('Parrilla 1')).toBeInTheDocument();
      expect(within(first).getByText(/10:00 – 15:00/)).toBeInTheDocument();
      expect(within(first).getByText('Ana Torres')).toBeInTheDocument();
      expect(within(first).getByText('4 personas, 2 invitados externos')).toBeInTheDocument();
      expect(within(first).getByText('hace 9 días')).toBeInTheDocument();
      expect(within(first).queryByText('Vencida sin decisión')).not.toBeInTheDocument();
    });

    it('marca como vencida sin decisión la pendiente cuya fecha ya pasó', async () => {
      listMock.mockResolvedValue({
        items: [
          item({
            reservationId: 'old',
            startsAt: '2026-07-01T15:00:00Z',
            endsAt: '2026-07-01T20:00:00Z',
          }),
          item({ reservationId: 'next' }),
        ],
        nextCursor: null,
      });
      renderPage();

      const badge = await screen.findByText('Vencida sin decisión');
      expect(badge).toBeInTheDocument();
      expect(screen.getAllByText('Vencida sin decisión')).toHaveLength(1);
    });

    it('indica "o más" cuando hay otra página y la carga con el cursor', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValueOnce({ items: [item()], nextCursor: 'c-2' }).mockResolvedValueOnce({
        items: [item({ reservationId: 'res-2' })],
        nextCursor: null,
      });
      renderPage();

      expect(await screen.findByText('1 o más solicitudes pendientes')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Cargar más' }));

      await waitFor(() =>
        expect(listMock).toHaveBeenLastCalledWith({ status: 'PENDING_APPROVAL', cursor: 'c-2' }),
      );
      expect(await screen.findByText('2 solicitudes pendientes')).toBeInTheDocument();
    });

    it('muestra el detalle con los participantes en el panel lateral', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      renderPage();

      await openFirstRow(user);

      expect(await screen.findByText('Luis Quispe')).toBeInTheDocument();
      expect(screen.getByText('(Invitado externo)')).toBeInTheDocument();
      expect(screen.getByText('(Titular)')).toBeInTheDocument();
      expect(detailMock).toHaveBeenCalledWith('res-1');
      expect(screen.getByTestId('location')).toHaveTextContent('reserva=res-1');
      const panel = screen.getByRole('dialog');
      expect(within(panel).getByText('Ana Torres', { selector: 'dd' })).toBeInTheDocument();
      expect(within(panel).getByText('Pendiente de aprobación')).toBeInTheDocument();
    });

    it('muestra el error del detalle sin el mensaje crudo y permite reintentar', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock
        .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'stack trace SQL'))
        .mockResolvedValue(detail());
      renderPage();

      await openFirstRow(user);

      expect(await screen.findByText(/No pudimos cargar el detalle/)).toBeInTheDocument();
      expect(screen.queryByText(/stack trace SQL/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('Luis Quispe')).toBeInTheDocument();
    });

    it('404 en el detalle ofrece actualizar y cierra el panel', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'crudo'));
      renderPage();

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Actualizar y cerrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('location')).not.toHaveTextContent('reserva=');
    });

    it('abre el panel directamente con ?reserva=<id>', async () => {
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      renderPage('/admin/reservas?tab=pendientes&reserva=res-1');

      expect(await screen.findByText('Luis Quispe')).toBeInTheDocument();
      expect(detailMock).toHaveBeenCalledWith('res-1');
      expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    });

    it('cierra el panel y quita ?reserva= de la URL', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      renderPage();

      await openFirstRow(user);
      await screen.findByText('Luis Quispe');
      await user.click(screen.getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('location')).not.toHaveTextContent('reserva=');
    });

    it('aprueba con confirmación, avisa con un toast y refresca la tabla', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [item()], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null });
      approveMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'APPROVED' });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveTextContent('Parrilla 1');
      expect(approveMock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

      await waitFor(() => expect(approveMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva aprobada')).toBeInTheDocument();
      await screen.findByText('No hay solicitudes pendientes');
      expect(listMock).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('aprueba desde el panel de detalle y lo cierra', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [item()], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      approveMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'APPROVED' });
      renderPage();

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }),
      );

      await waitFor(() => expect(approveMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva aprobada')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('location')).not.toHaveTextContent('reserva=');
    });

    it('permite cancelar la confirmación de aprobar sin llamar al servidor', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
      );

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(approveMock).not.toHaveBeenCalled();
    });

    it('409 RESERVATION_NOT_PENDING avisa dentro de la ventana, refresca y ofrece actualizar', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      approveMock.mockRejectedValue(
        new ApiRequestError(409, 'RESERVATION_NOT_PENDING', 'message crudo del servidor'),
      );
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent('La solicitud ya no está pendiente');
      expect(alert).not.toHaveTextContent('message crudo del servidor');
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));

      await user.click(within(dialog).getByRole('button', { name: 'Actualizar' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(approveMock).toHaveBeenCalledTimes(1);
    });

    it('exige un motivo antes de poder rechazar y lo envía', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      rejectMock.mockResolvedValue({
        reservationId: 'res-1',
        reservationStatus: 'REJECTED',
        rejectionReason: 'Mantenimiento programado',
      });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('El socio verá este motivo');
      const confirm = within(dialog).getByRole('button', { name: 'Rechazar' });
      expect(confirm).toBeDisabled();

      await user.type(within(dialog).getByLabelText(/Motivo del rechazo/), 'ab');
      expect(confirm).toBeDisabled();
      await user.type(
        within(dialog).getByLabelText(/Motivo del rechazo/),
        'c Mantenimiento programado',
      );
      expect(confirm).toBeEnabled();
      await user.click(confirm);

      await waitFor(() =>
        expect(rejectMock).toHaveBeenCalledWith('res-1', {
          reason: 'abc Mantenimiento programado',
        }),
      );
      expect(await screen.findByText('Reserva rechazada')).toBeInTheDocument();
    });

    it('400 VALIDATION_ERROR al rechazar muestra el requisito del motivo', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      rejectMock.mockRejectedValue(new ApiRequestError(400, 'VALIDATION_ERROR', 'zod crudo'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Motivo del rechazo/), 'Sin cupo');
      await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent('entre 3 y 280 caracteres');
      expect(alert).not.toHaveTextContent('zod crudo');
    });

    it('409 al rechazar se muestra dentro de la ventana de rechazo', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      rejectMock.mockRejectedValue(new ApiRequestError(409, 'RESERVATION_NOT_PENDING', 'crudo'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
      const dialog = screen.getByRole('dialog');
      await user.type(within(dialog).getByLabelText(/Motivo del rechazo/), 'Sin cupo');
      await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'La solicitud ya no está pendiente',
      );
      await user.click(within(dialog).getByRole('button', { name: 'Actualizar' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it.each([
      ['NOT_FOUND', 'No encontramos la reserva'],
      ['FORBIDDEN', 'No tienes permiso para esta acción'],
      ['NETWORK_ERROR', 'No pudimos conectar con el servidor'],
      ['INTERNAL_ERROR', 'No pudimos aprobar la solicitud'],
    ] as const)('traduce el error %s al aprobar', async (code, text) => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      approveMock.mockRejectedValue(new ApiRequestError(500, code, 'crudo'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(text);
    });

    it('cierra la sesión si el token expiró durante la acción', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      approveMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }),
      );

      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
    });

    it('muestra el error de carga y permite reintentar', async () => {
      const user = userEvent.setup();
      listMock
        .mockRejectedValueOnce(new ApiRequestError(0, 'NETWORK_ERROR', 'crudo'))
        .mockResolvedValue({ items: [item()], nextCursor: null });
      renderPage();

      expect(await screen.findByText('No pudimos cargar las solicitudes')).toBeInTheDocument();
      expect(screen.getByText(/No pudimos conectar con el servidor/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));

      expect(await screen.findByText('1 solicitud pendiente')).toBeInTheDocument();
    });

    it('sin permisos (403) muestra el mensaje de permiso', async () => {
      listMock.mockRejectedValue(new ApiRequestError(403, 'FORBIDDEN', 'crudo'));
      renderPage();
      expect(await screen.findByText(/no tiene permiso para consultar/)).toBeInTheDocument();
    });
  });

  describe('todas las reservas', () => {
    it('consulta por defecto reservas confirmadas con scope=all y status', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [
          item({ reservationStatus: 'CONFIRMED', resourceId: 'futbol-1', resourceType: 'FUTBOL' }),
        ],
        nextCursor: null,
      });
      renderPage();
      await openAllTab(user);

      const table = await screen.findByRole('table');
      expect(within(table).getByText('Cancha de fútbol 1')).toBeInTheDocument();
      expect(listMock).toHaveBeenLastCalledWith({
        status: 'CONFIRMED',
        resourceId: undefined,
        from: undefined,
        to: undefined,
        cursor: null,
      });
      expect(within(table).getByText('Confirmada')).toBeInTheDocument();
    });

    it('combina filtros de estado, instalación y fechas en hora de Lima y los guarda en la URL', async () => {
      const user = userEvent.setup();
      renderPage();
      await openAllTab(user);
      await screen.findByText('No hay reservas con esos filtros');

      await user.selectOptions(screen.getByLabelText('Estado'), 'CANCELLED');
      await user.selectOptions(await screen.findByLabelText('Instalación'), 'parrilla-1');
      await user.type(screen.getByLabelText('Desde'), '2026-07-01');
      await user.type(screen.getByLabelText('Hasta'), '2026-07-31');

      await waitFor(() =>
        expect(listMock).toHaveBeenLastCalledWith({
          status: 'CANCELLED',
          resourceId: 'parrilla-1',
          // 00:00 en Lima = 05:00Z; 23:59:59 en Lima = 04:59:59Z del día siguiente.
          from: '2026-07-01T05:00:00Z',
          to: '2026-08-01T04:59:59Z',
          cursor: null,
        }),
      );
      const search = screen.getByTestId('location').textContent ?? '';
      expect(search).toContain('estado=CANCELLED');
      expect(search).toContain('instalacion=parrilla-1');
      expect(search).toContain('desde=2026-07-01');
      expect(search).toContain('hasta=2026-07-31');
    });

    it('restaura los filtros desde la URL', async () => {
      renderPage('/admin/reservas?tab=todas&estado=REJECTED&instalacion=futbol-1');

      await waitFor(() =>
        expect(listMock).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'REJECTED', resourceId: 'futbol-1' }),
        ),
      );
      expect(screen.getByLabelText('Estado')).toHaveValue('REJECTED');
    });

    it('no consulta sin estado ni instalación y lo explica', async () => {
      const user = userEvent.setup();
      renderPage();
      await openAllTab(user);
      await screen.findByText('No hay reservas con esos filtros');
      listMock.mockClear();

      await user.selectOptions(screen.getByLabelText('Estado'), '');

      expect(await screen.findByText('Elige un estado o una instalación')).toBeInTheDocument();
      expect(listMock).not.toHaveBeenCalled();
    });

    it('con solo instalación (sin estado) consulta por resourceId', async () => {
      const user = userEvent.setup();
      renderPage();
      await openAllTab(user);
      await screen.findByText('No hay reservas con esos filtros');

      await user.selectOptions(screen.getByLabelText('Estado'), '');
      await user.selectOptions(await screen.findByLabelText('Instalación'), 'futbol-1');

      await waitFor(() =>
        expect(listMock).toHaveBeenLastCalledWith(
          expect.objectContaining({ status: undefined, resourceId: 'futbol-1' }),
        ),
      );
    });

    it('rechaza un rango invertido sin consultar', async () => {
      const user = userEvent.setup();
      renderPage();
      await openAllTab(user);
      await screen.findByText('No hay reservas con esos filtros');
      listMock.mockClear();

      await user.type(screen.getByLabelText('Desde'), '2026-07-31');
      await user.type(screen.getByLabelText('Hasta'), '2026-07-01');

      expect(await screen.findByText(/no puede ser anterior/)).toBeInTheDocument();
      // Nunca se envía el rango invertido al servidor.
      expect(listMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ to: '2026-07-02T04:59:59Z' }),
      );
    });

    it('pagina con cursor', async () => {
      const user = userEvent.setup();
      listMock
        // La primera llamada es la bandeja de pendientes (pestaña inicial).
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({
          items: [item({ reservationStatus: 'CONFIRMED' })],
          nextCursor: 'next-1',
        })
        .mockResolvedValueOnce({
          items: [item({ reservationId: 'res-9', reservationStatus: 'CONFIRMED' })],
          nextCursor: null,
        });
      renderPage();
      await openAllTab(user);

      await user.click(await screen.findByRole('button', { name: 'Cargar más' }));

      await waitFor(() =>
        expect(listMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-1' })),
      );
      await waitFor(() => expect(bodyRows()).toHaveLength(2));
    });

    it('muestra estado de carga', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockReturnValueOnce(new Promise(() => undefined));
      renderPage();
      await openAllTab(user);
      expect(await screen.findByText('Cargando reservas…')).toBeInTheDocument();
    });

    it('muestra error de carga sin mensaje crudo y reintenta', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'detalle interno'))
        .mockResolvedValue({ items: [], nextCursor: null });
      renderPage();
      await openAllTab(user);

      expect(await screen.findByText('No pudimos cargar las reservas')).toBeInTheDocument();
      expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByText('No hay reservas con esos filtros')).toBeInTheDocument();
    });

    it('cancela desde el panel con confirmación sin ventana de 24 h, avisa y refresca', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({
          items: [item({ reservationStatus: 'CONFIRMED' })],
          nextCursor: null,
        })
        .mockResolvedValue({ items: [], nextCursor: null });
      detailMock.mockResolvedValue(detail({ reservationStatus: 'CONFIRMED' }));
      cancelMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
      renderPage();
      await openAllTab(user);

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveTextContent('no tiene ventana de 24 horas');
      expect(dialog).toHaveTextContent('menos de 24 horas');
      expect(dialog).toHaveTextContent('cupo mensual del invitado se devolverá');
      expect(cancelMock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva cancelada')).toBeInTheDocument();
      await screen.findByText('No hay reservas con esos filtros');
    });

    it('avisa que para dejar motivo en una pendiente hay que rechazarla', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      renderPage();
      await openAllTab(user);

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

      expect(screen.getByRole('alertdialog')).toHaveTextContent('lo correcto es rechazarla');
    });

    it('409 CONFLICT al cancelar avisa dentro de la ventana que ya no está activa', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [item({ reservationStatus: 'CONFIRMED' })],
        nextCursor: null,
      });
      detailMock.mockResolvedValue(detail({ reservationStatus: 'CONFIRMED' }));
      cancelMock.mockRejectedValue(new ApiRequestError(409, 'CONFLICT', 'crudo'));
      renderPage();
      await openAllTab(user);

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'La reserva ya no está activa',
      );
      expect(within(dialog).getByRole('button', { name: 'Actualizar' })).toBeInTheDocument();
    });

    it('404 NOT_FOUND al cancelar muestra el mensaje de no encontrada', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [item({ reservationStatus: 'APPROVED' })],
        nextCursor: null,
      });
      detailMock.mockResolvedValue(detail({ reservationStatus: 'APPROVED' }));
      cancelMock.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'crudo'));
      renderPage();
      await openAllTab(user);

      await openFirstRow(user);
      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Sí, cancelar reserva',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos la reserva');
    });

    it('no ofrece acciones en rechazadas ni canceladas y muestra el motivo y la cancelación', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [
          item({
            reservationStatus: 'REJECTED',
            rejectionReason: 'Mantenimiento',
          }),
          item({ reservationId: 'res-2', reservationStatus: 'CANCELLED' }),
        ],
        nextCursor: null,
      });
      detailMock.mockImplementation((id: string) =>
        Promise.resolve(
          id === 'res-1'
            ? detail({ reservationStatus: 'REJECTED', rejectionReason: 'Mantenimiento' })
            : detail({
                reservationId: 'res-2',
                reservationStatus: 'CANCELLED',
                cancelledAt: '2026-07-05T15:00:00Z',
              }),
        ),
      );
      renderPage();
      await openAllTab(user);

      await screen.findByRole('table');
      expect(within(screen.getByRole('table')).getByText('Rechazada')).toBeInTheDocument();
      await user.click(bodyRows()[0]!);
      expect(await screen.findByText(/Mantenimiento/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await user.click(bodyRows()[1]!);
      expect(await screen.findByText('Cancelada el')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
    });
  });
});
