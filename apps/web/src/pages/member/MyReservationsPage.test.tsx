// Mis reservas (US-074, sobre US-033 criterios 13 y 14): pestañas en la URL,
// tabla con filtro y paginación, panel de detalle con dirección propia y
// cancelación en ventana con borde de 24 h y errores del contrato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
import type {
  Reservation,
  ReservationDetail,
  ReservationParticipant,
  Resource,
} from '@activa-club/shared-types';
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

function participant(
  overrides: Partial<ReservationParticipant> & Pick<ReservationParticipant, 'participantId'>,
): ReservationParticipant {
  return {
    reservationId: 'res-1',
    participantType: 'HOLDER',
    memberId: 'm-1',
    guestDni: null,
    guestName: null,
    startsAt: '2026-07-20T15:00:00Z',
    endsAt: '2026-07-20T16:30:00Z',
    ...overrides,
  };
}

const PARTICIPANTS: ReservationParticipant[] = [
  participant({ participantId: 'p1' }),
  participant({ participantId: 'p2', participantType: 'MEMBER', memberId: 'm-2' }),
  participant({
    participantId: 'p3',
    participantType: 'GUEST',
    memberId: null,
    guestDni: '12345678',
    guestName: 'Lucía Prado',
  }),
];

/** Lista y detalle coherentes entre sí para las reservas dadas. */
function serve(items: Reservation[], nextCursor: string | null = null) {
  listMock.mockResolvedValue({ items, nextCursor });
  detailMock.mockImplementation(async (id: string) => {
    const found = items.find((item) => item.reservationId === id);
    if (!found) {
      throw new ApiRequestError(404, 'NOT_FOUND', 'no existe');
    }
    const detail: ReservationDetail = { ...found, participants: PARTICIPANTS };
    return detail;
  });
}

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="search">{location.search}</p>;
}

function renderPage(url = '/socio/reservas/mias') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <MyReservationsPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { invalidateSpy };
}

async function openFirstRow(user: ReturnType<typeof userEvent.setup>) {
  const rows = await screen.findAllByRole('row', { name: /Abrir detalle/ });
  await user.click(rows[0]!);
  return screen.findByRole('dialog', { name: 'Detalle de la reserva' });
}

describe('MyReservationsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    fetchResourcesMock.mockResolvedValue([FUTBOL]);
    serve([]);
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
    expect(await screen.findByText('No tienes reservas próximas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservar una instalación' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('ofrece "Nueva reserva" hacia el asistente de reserva', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Nueva reserva' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('separa próximas y pasadas en pestañas con contador, instalación, estado y personas', async () => {
    const user = userEvent.setup();
    serve([
      reservation({
        reservationId: 'past',
        startsAt: '2026-07-01T15:00:00Z',
        endsAt: '2026-07-01T16:30:00Z',
        reservationStatus: 'CANCELLED',
        cancelledAt: '2026-06-28T10:00:00Z',
      }),
      reservation({ reservationId: 'next' }),
    ]);
    renderPage();

    const upcomingTab = await screen.findByRole('tab', { name: /Próximas/ });
    const pastTab = screen.getByRole('tab', { name: /Pasadas/ });
    expect(upcomingTab).toHaveAttribute('aria-selected', 'true');
    expect(await within(upcomingTab).findByText('1')).toBeInTheDocument();
    expect(within(pastTab).getByText('1')).toBeInTheDocument();

    const upcoming = screen.getByRole('tabpanel');
    expect(within(upcoming).getByText('Cancha de fútbol 1')).toBeInTheDocument();
    expect(within(upcoming).getByText('Confirmada')).toBeInTheDocument();
    expect(within(upcoming).getByText('3 personas, 1 invitado externo')).toBeInTheDocument();
    // 15:00Z = 10:00 en Lima.
    expect(within(upcoming).getByText(/10:00 – 11:30/)).toBeInTheDocument();
    expect(within(upcoming).queryByText('Cancelada')).not.toBeInTheDocument();

    await user.click(pastTab);
    const past = screen.getByRole('tabpanel');
    expect(within(past).getByText('Cancelada')).toBeInTheDocument();
    expect(within(past).queryByText('Confirmada')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('tab=pasadas');
  });

  it('abre la pestaña indicada en la URL y ordena las pasadas de la más reciente', async () => {
    serve([
      reservation({
        reservationId: 'old',
        startsAt: '2026-06-01T15:00:00Z',
        endsAt: '2026-06-01T16:30:00Z',
      }),
      reservation({
        reservationId: 'recent',
        startsAt: '2026-07-05T15:00:00Z',
        endsAt: '2026-07-05T16:30:00Z',
      }),
    ]);
    renderPage('/socio/reservas/mias?tab=pasadas');

    expect(await screen.findByRole('tab', { name: /Pasadas/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const rows = await screen.findAllByRole('row', { name: /Abrir detalle/ });
    expect(rows[0]).toHaveAccessibleName(/5 de julio/);
    expect(rows[1]).toHaveAccessibleName(/1 de junio/);
  });

  it('filtra por estado enviando el parámetro al servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('No tienes reservas próximas');

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

  it('muestra el motivo de rechazo y deshabilita la cancelación en el panel', async () => {
    const user = userEvent.setup();
    serve([
      reservation({ reservationStatus: 'REJECTED', rejectionReason: 'Evento del club ese día' }),
    ]);
    renderPage();

    const panel = await openFirstRow(user);

    expect(await within(panel).findByText(/Evento del club ese día/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Cancelar reserva' })).toBeDisabled();
    expect(
      within(panel).getByText('Esta reserva fue rechazada, no se puede cancelar.'),
    ).toBeInTheDocument();
  });

  it('muestra cuándo se canceló una reserva cancelada', async () => {
    const user = userEvent.setup();
    serve([reservation({ reservationStatus: 'CANCELLED', cancelledAt: '2026-07-08T15:00:00Z' })]);
    renderPage();

    const panel = await openFirstRow(user);

    expect(await within(panel).findByText('Cancelada el')).toBeInTheDocument();
    expect(within(panel).getByText(/8 de julio de 2026/)).toBeInTheDocument();
    expect(within(panel).getByText('Esta reserva ya fue cancelada.')).toBeInTheDocument();
  });

  describe('panel de detalle', () => {
    it('muestra participantes sin inventar nombres de socios ni exponer el DNI', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage();

      const panel = await openFirstRow(user);

      expect(await within(panel).findByText('Lucía Prado')).toBeInTheDocument();
      expect(within(panel).getByText('Socio del club')).toBeInTheDocument();
      expect(within(panel).getByText('Tú')).toBeInTheDocument();
      expect(screen.queryByText(/12345678/)).not.toBeInTheDocument();
      expect(detailMock).toHaveBeenCalledWith('res-1');
      expect(screen.getByTestId('search')).toHaveTextContent('reserva=res-1');
    });

    it('muestra error del detalle sin el mensaje crudo del servidor', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      detailMock.mockRejectedValue(
        new ApiRequestError(500, 'INTERNAL_ERROR', 'stack trace interno'),
      );
      renderPage();

      const panel = await openFirstRow(user);

      expect(await within(panel).findByText(/No pudimos cargar el detalle/)).toBeInTheDocument();
      expect(screen.queryByText(/stack trace interno/)).not.toBeInTheDocument();
      expect(within(panel).getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    });

    it('abre la reserva desde la dirección ?reserva= y la cierra con la X', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage('/socio/reservas/mias?reserva=res-1');

      const panel = await screen.findByRole('dialog', { name: 'Detalle de la reserva' });
      expect(await within(panel).findByText('Lucía Prado')).toBeInTheDocument();

      await user.click(within(panel).getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('search')).not.toHaveTextContent('reserva=');
    });

    it('cierra con Escape y vuelve la dirección a la lista', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage();

      await openFirstRow(user);
      expect(screen.getByTestId('search')).toHaveTextContent('reserva=res-1');
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('search')).not.toHaveTextContent('reserva=');
    });

    it('devuelve el foco a la fila al cerrar', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage();

      const panel = await openFirstRow(user);
      const row = screen.getAllByRole('row', { hidden: true, name: /Abrir detalle/ })[0]!;
      await user.click(within(panel).getByRole('button', { name: 'Cerrar' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(row).toHaveFocus();
    });

    it('abre el detalle con el teclado desde la fila', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage();

      const row = (await screen.findAllByRole('row', { name: /Abrir detalle/ }))[0]!;
      row.focus();
      await user.keyboard('{Enter}');

      expect(await screen.findByRole('dialog', { name: 'Detalle de la reserva' })).toBeVisible();
    });

    it('informa que no encontró una reserva ajena o inexistente sin datos', async () => {
      serve([reservation()]);
      renderPage('/socio/reservas/mias?reserva=ajena');

      const panel = await screen.findByRole('dialog', { name: 'Detalle de la reserva' });
      expect(await within(panel).findByText('No encontramos esta reserva')).toBeInTheDocument();
      expect(
        within(panel).queryByRole('button', { name: 'Cancelar reserva' }),
      ).not.toBeInTheDocument();
    });
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
    expect(await screen.findByText('No tienes reservas próximas')).toBeInTheDocument();
  });

  describe('cancelación', () => {
    async function openCancelDialog(user: ReturnType<typeof userEvent.setup>) {
      const panel = await openFirstRow(user);
      await user.click(await within(panel).findByRole('button', { name: 'Cancelar reserva' }));
      return screen.getByRole('alertdialog');
    }

    it('pide confirmación, cancela, avisa, cierra el panel e invalida lista y disponibilidad', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      cancelMock.mockResolvedValue({ reservationId: 'res-1', reservationStatus: 'CANCELLED' });
      const { invalidateSpy } = renderPage();

      const dialog = await openCancelDialog(user);
      expect(cancelMock).not.toHaveBeenCalled();
      expect(dialog).toHaveTextContent(/La franja quedará libre/);
      expect(dialog).toHaveTextContent(/no se puede deshacer/);
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('res-1'));
      expect(await screen.findByText('Reserva cancelada')).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(screen.getByTestId('search')).not.toHaveTextContent('reserva=');
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['resources', 'futbol-1', 'availability'],
      });
    });

    it('permite mantener la reserva sin llamar al servidor y devuelve el foco al botón', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      renderPage();

      const dialog = await openCancelDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Mantener reserva' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(cancelMock).not.toHaveBeenCalled();
      const panel = screen.getByRole('dialog', { name: 'Detalle de la reserva' });
      expect(within(panel).getByRole('button', { name: 'Cancelar reserva' })).toHaveFocus();
    });

    it('habilita cancelar con exactamente 24 h y deshabilita con 23:59 explicando el motivo', async () => {
      const user = userEvent.setup();
      // `NOW` = 2026-07-10T12:00Z. Inicio 24 h exactas / 23:59 después.
      serve([
        reservation({
          reservationId: 'short',
          startsAt: '2026-07-11T11:59:00Z',
          endsAt: '2026-07-11T13:29:00Z',
        }),
        reservation({
          reservationId: 'exact',
          startsAt: '2026-07-11T12:00:00Z',
          endsAt: '2026-07-11T13:30:00Z',
        }),
      ]);
      renderPage();

      const rows = await screen.findAllByRole('row', { name: /Abrir detalle/ });
      await user.click(rows[0]!);
      let panel = await screen.findByRole('dialog', { name: 'Detalle de la reserva' });
      expect(await within(panel).findByRole('button', { name: 'Cancelar reserva' })).toBeDisabled();
      expect(within(panel).getByText(/Faltan menos de 24 horas/)).toBeVisible();
      await user.click(within(panel).getByRole('button', { name: 'Cerrar' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

      await user.click((await screen.findAllByRole('row', { name: /Abrir detalle/ }))[1]!);
      panel = await screen.findByRole('dialog', { name: 'Detalle de la reserva' });
      expect(await within(panel).findByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
      expect(within(panel).queryByText(/Faltan menos de 24 horas/)).not.toBeInTheDocument();
    });

    it('permite cancelar una reserva pendiente de aprobación', async () => {
      const user = userEvent.setup();
      serve([reservation({ reservationStatus: 'PENDING_APPROVAL' })]);
      renderPage();

      const panel = await openFirstRow(user);
      expect(await within(panel).findByRole('button', { name: 'Cancelar reserva' })).toBeEnabled();
      expect(within(panel).getByText('Pendiente de aprobación')).toBeInTheDocument();
    });

    it.each([
      ['CANCELLATION_TOO_LATE', 422, 'Ya no se puede cancelar'],
      ['CONFLICT', 409, 'La reserva ya no está activa'],
      ['NOT_FOUND', 404, 'No encontramos la reserva'],
      ['NETWORK_ERROR', 0, 'No pudimos conectar con el servidor'],
    ] as const)(
      'traduce el error %s dentro de la ventana sin cerrarla ni mostrar el mensaje crudo',
      async (code, status, title) => {
        const user = userEvent.setup();
        serve([reservation()]);
        cancelMock.mockRejectedValue(
          new ApiRequestError(status, code, 'mensaje interno del server'),
        );
        const { invalidateSpy } = renderPage();

        const dialog = await openCancelDialog(user);
        await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

        const alert = await within(dialog).findByRole('alert');
        expect(within(alert).getByText(title)).toBeInTheDocument();
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(screen.queryByText(/mensaje interno del server/)).not.toBeInTheDocument();
        expect(screen.queryByText('Reserva cancelada')).not.toBeInTheDocument();
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] });
        expect(signOutMock).not.toHaveBeenCalled();
      },
    );

    it('cierra la sesión cuando el token expiró', async () => {
      const user = userEvent.setup();
      serve([reservation()]);
      cancelMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'jwt expired'));
      renderPage();

      const dialog = await openCancelDialog(user);
      await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar reserva' }));

      expect(await within(dialog).findByText('Tu sesión expiró')).toBeInTheDocument();
      expect(signOutMock).toHaveBeenCalledTimes(1);
    });
  });
});
