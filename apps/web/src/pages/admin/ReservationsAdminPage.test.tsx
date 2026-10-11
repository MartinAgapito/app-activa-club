// Reservas y aprobaciones (US-034 criterios 1 y 13, US-036 criterios 8 y 12):
// bandeja de pendientes, aprobar/rechazar, consulta con filtros, paginación,
// cancelación administrativa y errores del contrato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReservationsAdminPage />
    </QueryClientProvider>,
  );
}

async function openAllTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Todas las reservas' }));
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

  describe('bandeja de pendientes', () => {
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

    it('muestra contador, instalación, hora de Lima, titular y participantes', async () => {
      listMock.mockResolvedValue({
        items: [
          item(),
          item({ reservationId: 'res-2', startsAt: '2026-07-21T15:00:00Z', guestCount: 0 }),
        ],
        nextCursor: null,
      });
      renderPage();

      expect(await screen.findByText('2 solicitudes pendientes')).toBeInTheDocument();
      const first = screen.getAllByRole('listitem')[0]!;
      expect(within(first).getByText('Parrilla 1')).toBeInTheDocument();
      expect(within(first).getByText(/10:00 – 15:00/)).toBeInTheDocument();
      expect(within(first).getByText('Ana Torres')).toBeInTheDocument();
      expect(within(first).getByText('4 personas, 2 invitados externos')).toBeInTheDocument();
      expect(within(first).getByText('Pendiente de aprobación')).toBeInTheDocument();
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

    it('muestra el detalle con los participantes', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockResolvedValue(detail());
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));

      expect(await screen.findByText('Luis Quispe')).toBeInTheDocument();
      expect(screen.getByText('(Invitado externo)')).toBeInTheDocument();
      expect(detailMock).toHaveBeenCalledWith('res-1');
    });

    it('muestra el error del detalle sin el mensaje crudo', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      detailMock.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'stack trace SQL'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));

      expect(await screen.findByText(/No pudimos cargar el detalle/)).toBeInTheDocument();
      expect(screen.queryByText(/stack trace SQL/)).not.toBeInTheDocument();
    });

    it('aprueba con confirmación y refresca la bandeja', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [item()], nextCursor: null })
        .mockResolvedValue({ items: [], nextCursor: null });
      approveMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'APPROVED' });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      const dialog = screen.getByRole('alertdialog');
      expect(approveMock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

      await waitFor(() => expect(approveMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Solicitud aprobada')).toBeInTheDocument();
      await screen.findByText('No hay solicitudes pendientes');
      expect(listMock).toHaveBeenCalledTimes(2);
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

    it('409 RESERVATION_NOT_PENDING al aprobar avisa y refresca', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      approveMock.mockRejectedValue(
        new ApiRequestError(409, 'RESERVATION_NOT_PENDING', 'message crudo del servidor'),
      );
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Aprobar' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }),
      );

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('La solicitud ya no está pendiente');
      expect(alert).not.toHaveTextContent('message crudo del servidor');
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
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
      const dialog = screen.getByRole('alertdialog');
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
      expect(await screen.findByText('Solicitud rechazada')).toBeInTheDocument();
    });

    it('400 VALIDATION_ERROR al rechazar muestra el requisito del motivo', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      rejectMock.mockRejectedValue(new ApiRequestError(400, 'VALIDATION_ERROR', 'zod crudo'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Rechazar' }));
      const dialog = screen.getByRole('alertdialog');
      await user.type(within(dialog).getByLabelText(/Motivo del rechazo/), 'Sin cupo');
      await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('entre 3 y 280 caracteres');
      expect(alert).not.toHaveTextContent('zod crudo');
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

      expect(
        await screen.findByRole('heading', { name: 'Cancha de fútbol 1' }),
      ).toBeInTheDocument();
      expect(listMock).toHaveBeenLastCalledWith({
        status: 'CONFIRMED',
        resourceId: undefined,
        from: undefined,
        to: undefined,
        cursor: null,
      });
      expect(within(screen.getByRole('listitem')).getByText('Confirmada')).toBeInTheDocument();
    });

    it('combina filtros de estado, instalación y fechas en hora de Lima', async () => {
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
      await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
    });

    it('muestra estado de carga, vacío y error con reintento', async () => {
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

    it('cancela con confirmación sin ventana de 24 h y refresca', async () => {
      const user = userEvent.setup();
      listMock
        .mockResolvedValueOnce({ items: [], nextCursor: null })
        .mockResolvedValueOnce({
          items: [item({ reservationStatus: 'CONFIRMED' })],
          nextCursor: null,
        })
        .mockResolvedValue({ items: [], nextCursor: null });
      cancelMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
      renderPage();
      await openAllTab(user);

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      const dialog = screen.getByRole('alertdialog');
      expect(dialog).toHaveTextContent('no tiene ventana de 24 horas');
      expect(cancelMock).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva cancelada')).toBeInTheDocument();
    });

    it('avisa que para dejar motivo en una pendiente hay que rechazarla', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [item()], nextCursor: null });
      renderPage();
      await openAllTab(user);

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));

      expect(screen.getByRole('alertdialog')).toHaveTextContent(
        'lo correcto es rechazarla desde la bandeja',
      );
    });

    it('409 CONFLICT al cancelar avisa que ya no está activa', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [item({ reservationStatus: 'CONFIRMED' })],
        nextCursor: null,
      });
      cancelMock.mockRejectedValue(new ApiRequestError(409, 'CONFLICT', 'crudo'));
      renderPage();
      await openAllTab(user);

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Sí, cancelar reserva',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('La reserva ya no está activa');
    });

    it('404 NOT_FOUND al cancelar muestra el mensaje de no encontrada', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({
        items: [item({ reservationStatus: 'APPROVED' })],
        nextCursor: null,
      });
      cancelMock.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'crudo'));
      renderPage();
      await openAllTab(user);

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Sí, cancelar reserva',
        }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos la reserva');
    });

    it('no ofrece cancelar reservas rechazadas ni canceladas y muestra el motivo', async () => {
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
      renderPage();
      await openAllTab(user);

      expect(await screen.findByText(/Mantenimiento/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).not.toBeInTheDocument();
    });
  });
});
