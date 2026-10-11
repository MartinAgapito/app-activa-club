// Mis reservas (US-033, criterios 13 y 14): lista próximas/pasadas, filtro,
// paginación, detalle, cancelación con confirmación, borde de 24 h y errores
// del contrato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Reservation, ReservationDetail, Resource } from '@activa-club/shared-types';
import { MyReservationsPage } from './MyReservationsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { listMock, detailMock, cancelMock, fetchResourcesMock, signOutMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  detailMock: vi.fn(),
  cancelMock: vi.fn(),
  fetchResourcesMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../reservations/my-reservations-client', () => ({
  MY_RESERVATIONS_PAGE_SIZE: 20,
  listMyReservations: listMock,
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

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: 'res-1',
    resourceId: 'futbol-1',
    resourceType: 'FUTBOL',
    holderMemberId: 'm-1',
    startsAt: '2026-07-20T15:00:00Z',
    endsAt: '2026-07-20T16:30:00Z',
    reservationStatus: 'CONFIRMED',
    participantCount: 3,
    guestCount: 1,
    requiresApproval: false,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MyReservationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

describe('MyReservationsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    fetchResourcesMock.mockResolvedValue([FUTBOL]);
    listMock.mockResolvedValue({ items: [], nextCursor: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('muestra el estado de carga', () => {
    listMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText('Cargando tus reservas…')).toBeInTheDocument();
  });

  it('muestra el estado vacío con enlace a reservar', async () => {
    renderPage();
    expect(await screen.findByText('Aún no tienes reservas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservar una instalación' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('separa próximas y pasadas, con instalación, estado y participantes', async () => {
    listMock.mockResolvedValue({
      items: [
        reservation({
          reservationId: 'past',
          startsAt: '2026-07-01T15:00:00Z',
          endsAt: '2026-07-01T16:30:00Z',
          reservationStatus: 'CANCELLED',
          cancelledAt: '2026-06-28T10:00:00Z',
        }),
        reservation({ reservationId: 'next' }),
      ],
      nextCursor: null,
    });
    renderPage();

    const upcoming = await screen.findByRole('region', { name: 'Próximas' });
    const past = screen.getByRole('region', { name: 'Pasadas' });
    expect(within(upcoming).getByText('Cancha de fútbol 1')).toBeInTheDocument();
    expect(within(upcoming).getByText('Confirmada')).toBeInTheDocument();
    expect(within(upcoming).getByText('3 personas, 1 invitado externo')).toBeInTheDocument();
    // 15:00Z = 10:00 en Lima.
    expect(within(upcoming).getByText(/10:00 – 11:30/)).toBeInTheDocument();
    expect(within(past).getByText('Cancelada')).toBeInTheDocument();
    expect(within(past).queryByText('Confirmada')).not.toBeInTheDocument();
  });

  it('filtra por estado enviando el parámetro al servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Aún no tienes reservas');

    await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'REJECTED');

    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith({ status: 'REJECTED', cursor: null }),
    );
    expect(await screen.findByText('No hay reservas con ese estado')).toBeInTheDocument();
  });

  it('pagina con "Cargar más" usando el cursor', async () => {
    const user = userEvent.setup();
    listMock
      .mockResolvedValueOnce({
        items: [reservation({ reservationId: 'a' })],
        nextCursor: 'cursor-2',
      })
      .mockResolvedValueOnce({
        items: [
          reservation({
            reservationId: 'b',
            startsAt: '2026-07-25T15:00:00Z',
            endsAt: '2026-07-25T16:30:00Z',
          }),
        ],
        nextCursor: null,
      });
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(screen.getAllByText('Cancha de fútbol 1')).toHaveLength(2));
    expect(listMock).toHaveBeenLastCalledWith({ status: undefined, cursor: 'cursor-2' });
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('muestra el motivo de rechazo y deshabilita la cancelación', async () => {
    listMock.mockResolvedValue({
      items: [
        reservation({ reservationStatus: 'REJECTED', rejectionReason: 'Evento del club ese día' }),
      ],
      nextCursor: null,
    });
    renderPage();

    expect(await screen.findByText(/Evento del club ese día/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar reserva' })).toBeDisabled();
    expect(
      screen.getByText('Esta reserva fue rechazada, no se puede cancelar.'),
    ).toBeInTheDocument();
  });

  it('expande el detalle con participantes sin inventar nombres de socios', async () => {
    const user = userEvent.setup();
    const detail: ReservationDetail = {
      ...reservation(),
      participants: [
        {
          participantId: 'p1',
          reservationId: 'res-1',
          participantType: 'HOLDER',
          memberId: 'm-1',
          guestDni: null,
          guestName: null,
          startsAt: '2026-07-20T15:00:00Z',
          endsAt: '2026-07-20T16:30:00Z',
        },
        {
          participantId: 'p2',
          reservationId: 'res-1',
          participantType: 'MEMBER',
          memberId: 'm-2',
          guestDni: null,
          guestName: null,
          startsAt: '2026-07-20T15:00:00Z',
          endsAt: '2026-07-20T16:30:00Z',
        },
        {
          participantId: 'p3',
          reservationId: 'res-1',
          participantType: 'GUEST',
          memberId: null,
          guestDni: '12345678',
          guestName: 'Lucía Prado',
          startsAt: '2026-07-20T15:00:00Z',
          endsAt: '2026-07-20T16:30:00Z',
        },
      ],
    };
    listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
    detailMock.mockResolvedValue(detail);
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('Lucía Prado')).toBeInTheDocument();
    expect(screen.getByText('Socio del club')).toBeInTheDocument();
    expect(screen.queryByText('12345678')).not.toBeInTheDocument();
    expect(detailMock).toHaveBeenCalledWith('res-1');
  });

  it('muestra error del detalle sin el mensaje crudo del servidor', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
    detailMock.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'stack trace interno'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText(/No pudimos cargar el detalle/)).toBeInTheDocument();
    expect(screen.queryByText(/stack trace interno/)).not.toBeInTheDocument();
  });

  it('muestra error de carga sin el mensaje crudo y permite reintentar', async () => {
    listMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'DynamoDB ProvisionedThroughputExceeded'),
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No pudimos cargar tus reservas')).toBeInTheDocument();
    expect(screen.queryByText(/DynamoDB/)).not.toBeInTheDocument();

    listMock.mockResolvedValue({ items: [], nextCursor: null });
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Aún no tienes reservas')).toBeInTheDocument();
  });

  describe('cancelación', () => {
    it('pide confirmación, cancela, informa e invalida lista y disponibilidad', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
      cancelMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
      const { invalidateSpy } = renderPage();

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      expect(cancelMock).not.toHaveBeenCalled();
      const dialog = screen.getByRole('alertdialog');
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva cancelada')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'futbol-1', 'availability'],
      });
    });

    it('permite mantener la reserva sin llamar al servidor', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(screen.getByRole('button', { name: 'Mantener reserva' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('habilita cancelar con exactamente 24 h y deshabilita con 23:59', async () => {
      // `NOW` = 2026-07-10T12:00Z. Inicio 24 h exactas / 23:59 después.
      listMock.mockResolvedValue({
        items: [
          reservation({
            reservationId: 'exact',
            startsAt: '2026-07-11T12:00:00Z',
            endsAt: '2026-07-11T13:30:00Z',
          }),
          reservation({
            reservationId: 'short',
            startsAt: '2026-07-11T11:59:00Z',
            endsAt: '2026-07-11T13:29:00Z',
          }),
        ],
        nextCursor: null,
      });
      renderPage();

      await screen.findAllByRole('button', { name: 'Cancelar reserva' });
      const buttons = screen.getAllByRole('button', { name: 'Cancelar reserva' });
      // Orden ascendente del servidor: primero la de 23:59, luego la de 24:00.
      const items = screen.getAllByRole('listitem');
      const shortItem = items.find((item) => within(item).queryByText(/Faltan menos de 24 horas/));
      expect(shortItem).toBeDefined();
      expect(buttons.filter((button) => !button.hasAttribute('disabled'))).toHaveLength(1);
      expect(buttons.filter((button) => button.hasAttribute('disabled'))).toHaveLength(1);
    });

    it('permite cancelar una reserva pendiente de aprobación', async () => {
      listMock.mockResolvedValue({
        items: [reservation({ reservationStatus: 'PENDING_APPROVAL' })],
        nextCursor: null,
      });
      renderPage();
      expect(await screen.findByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
      expect(
        within(screen.getByRole('listitem')).getByText('Pendiente de aprobación'),
      ).toBeInTheDocument();
    });

    it.each([
      ['CANCELLATION_TOO_LATE', 422, 'Ya no se puede cancelar'],
      ['CONFLICT', 409, 'La reserva ya no está activa'],
      ['NOT_FOUND', 404, 'No encontramos la reserva'],
      ['NETWORK_ERROR', 0, 'No pudimos conectar con el servidor'],
    ] as const)('traduce el error %s sin mostrar el mensaje crudo', async (code, status, title) => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
      cancelMock.mockRejectedValue(new ApiRequestError(status, code, 'mensaje interno del server'));
      const { invalidateSpy } = renderPage();

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(screen.getByRole('button', { name: 'Sí, cancelar reserva' }));

      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText(title)).toBeInTheDocument();
      expect(screen.queryByText(/mensaje interno del server/)).not.toBeInTheDocument();
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] });
      expect(signOutMock).not.toHaveBeenCalled();
    });

    it('cierra la sesión cuando el token expiró', async () => {
      const user = userEvent.setup();
      listMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
      cancelMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'jwt expired'));
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
      await user.click(screen.getByRole('button', { name: 'Sí, cancelar reserva' }));

      expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });
});
