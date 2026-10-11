// Catálogo de instalaciones (US-028), selector de franjas horarias (US-029)
// y flujo completo de reserva (US-032, al final del archivo). Cubre: estados de
// carga/error/vacío del catálogo y de la disponibilidad, selección de
// instalación y de día, y el renderizado distinguible de las tres
// situaciones de una franja (libre/seleccionable, ocupada y en
// mantenimiento), más el aviso a nivel de recurso cuando el mantenimiento es
// indefinido.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AvailabilityResponse, Member, Resource } from '@activa-club/shared-types';
import { ReservationsPage } from './ReservationsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const {
  fetchResourcesMock,
  fetchResourceAvailabilityMock,
  fetchMemberProfileMock,
  createReservationMock,
  lookupMemberByDniMock,
  lookupGuestByDniMock,
  signOutMock,
} = vi.hoisted(() => ({
  fetchResourcesMock: vi.fn(),
  fetchResourceAvailabilityMock: vi.fn(),
  fetchMemberProfileMock: vi.fn(),
  createReservationMock: vi.fn(),
  lookupMemberByDniMock: vi.fn(),
  lookupGuestByDniMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: fetchMemberProfileMock,
}));

vi.mock('../../reservations/reservations-client', () => ({
  createReservation: createReservationMock,
  lookupMemberByDni: lookupMemberByDniMock,
  lookupGuestByDni: lookupGuestByDniMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: fetchResourceAvailabilityMock,
}));

const FUTBOL_1: Resource = {
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

const PISCINA_MAINTENANCE: Resource = {
  resourceId: 'piscina-1',
  type: 'PISCINA',
  name: 'Piscina',
  capacity: 5,
  blockMinutes: 120,
  opensAt: '08:00',
  closesAt: '20:00',
  requiresApproval: false,
  resourceStatus: 'MAINTENANCE',
};

const PARRILLA_1: Resource = {
  resourceId: 'parrilla-1',
  type: 'PARRILLA',
  name: 'Parrilla 1',
  capacity: 20,
  blockMinutes: 300,
  opensAt: '10:00',
  closesAt: '23:00',
  requiresApproval: true,
  resourceStatus: 'AVAILABLE',
};

const PISCINA_SMALL: Resource = {
  resourceId: 'piscina-2',
  type: 'PISCINA',
  name: 'Piscina chica',
  capacity: 3,
  blockMinutes: 120,
  opensAt: '08:00',
  closesAt: '20:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

const CATALOG: Resource[] = [FUTBOL_1, PISCINA_MAINTENANCE];

const HOLDER: Member = {
  memberId: 'member-holder',
  legacyId: null,
  dni: '11111111',
  email: 'titular@example.com',
  firstName: 'Lucía',
  lastName: 'Rojas',
  phone: null,
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: null,
  rejectionReason: null,
  membershipType: 'MONTHLY',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const MIXED_AVAILABILITY: AvailabilityResponse = {
  resourceId: 'futbol-1',
  date: '2026-08-12',
  blockMinutes: 90,
  resourceStatus: 'AVAILABLE',
  slots: [
    {
      startsAt: '2026-08-12T11:00:00Z',
      endsAt: '2026-08-12T12:30:00Z',
      available: true,
      status: 'AVAILABLE',
    },
    {
      startsAt: '2026-08-12T12:30:00Z',
      endsAt: '2026-08-12T14:00:00Z',
      available: false,
      status: 'RESERVED',
    },
    {
      startsAt: '2026-08-12T14:00:00Z',
      endsAt: '2026-08-12T15:30:00Z',
      available: false,
      status: 'MAINTENANCE',
    },
  ],
};

const ALL_UNAVAILABLE_MAINTENANCE: AvailabilityResponse = {
  resourceId: 'piscina-1',
  date: '2026-08-12',
  blockMinutes: 120,
  resourceStatus: 'MAINTENANCE',
  slots: [
    {
      startsAt: '2026-08-12T13:00:00Z',
      endsAt: '2026-08-12T15:00:00Z',
      available: false,
      status: 'MAINTENANCE',
    },
    {
      startsAt: '2026-08-12T15:00:00Z',
      endsAt: '2026-08-12T17:00:00Z',
      available: false,
      status: 'MAINTENANCE',
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ReservationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReservationsPage', () => {
  beforeEach(() => {
    fetchMemberProfileMock.mockResolvedValue(HOLDER);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchResourcesMock.mockReset();
    fetchResourceAvailabilityMock.mockReset();
    fetchMemberProfileMock.mockReset();
    createReservationMock.mockReset();
    lookupMemberByDniMock.mockReset();
    lookupGuestByDniMock.mockReset();
    signOutMock.mockReset();
  });

  it('muestra el estado de carga del catálogo', () => {
    fetchResourcesMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Cargando el catálogo de instalaciones…')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintento si falla el catálogo', async () => {
    fetchResourcesMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /no pudimos cargar el catálogo/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ocurrió un error interno.')).toBeInTheDocument();

    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
  });

  it('muestra un estado vacío cuando el catálogo no tiene instalaciones', async () => {
    fetchResourcesMock.mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByText('Todavía no hay instalaciones cargadas')).toBeInTheDocument();
  });

  it('lista el catálogo con aforo y duración, marcando un recurso en mantenimiento (US-028, criterio 8)', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    renderPage();

    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
    expect(screen.getByText('14 personas')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();

    // La piscina en mantenimiento sigue apareciendo en el catálogo, marcada
    // como tal (no desaparece de la lista).
    expect(screen.getByRole('heading', { name: 'Piscina' })).toBeInTheDocument();
    expect(screen.getByText('En mantenimiento')).toBeInTheDocument();
  });

  it('al elegir una instalación consulta y muestra su disponibilidad del día', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);

    expect(fetchResourceAvailabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'futbol-1' }),
    );
    expect(await screen.findByText('Disponibilidad — Cancha de fútbol 1')).toBeInTheDocument();
  });

  it('distingue franja libre (seleccionable), ocupada y en mantenimiento (US-029, criterio 11)', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);
    await screen.findByText('Disponibilidad — Cancha de fútbol 1');

    const availableSlot = screen.getByRole('button', { name: /franja 06:00 – 07:30, disponible/i });
    const reservedSlot = screen.getByRole('button', { name: /franja 07:30 – 09:00, ocupada/i });
    const maintenanceSlot = screen.getByRole('button', {
      name: /franja 09:00 – 10:30, en mantenimiento/i,
    });

    expect(availableSlot).toBeEnabled();
    expect(reservedSlot).toBeDisabled();
    expect(maintenanceSlot).toBeDisabled();

    // Solo la franja disponible se puede seleccionar.
    await user.click(availableSlot);
    expect(availableSlot).toHaveAttribute('aria-pressed', 'true');

    await user.click(reservedSlot);
    expect(reservedSlot).toHaveAttribute('aria-pressed', 'false');
  });

  it('muestra un único aviso a nivel de recurso cuando el mantenimiento es indefinido, sin repetirlo franja por franja', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(ALL_UNAVAILABLE_MAINTENANCE);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('heading', { name: 'Piscina' });
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[1]!);

    expect(
      await screen.findByText(
        'Esta instalación está en mantenimiento y no admite reservas por el momento.',
      ),
    ).toBeInTheDocument();

    // Las franjas individuales no repiten el badge "En mantenimiento": ya lo
    // explica el aviso de arriba.
    expect(screen.queryAllByText('En mantenimiento')).toHaveLength(1);
  });

  it('muestra el estado de carga y error de la disponibilidad, con reintento', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);

    expect(await screen.findByText('Cargando la disponibilidad del día…')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintento si falla la disponibilidad', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockRejectedValueOnce(
      new ApiRequestError(404, 'NOT_FOUND', 'No encontramos esa instalación.'),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);

    expect(
      await screen.findByRole('heading', { name: /no pudimos cargar la disponibilidad/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('No encontramos esa instalación.')).toBeInTheDocument();

    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(
      await screen.findByRole('button', { name: /franja 06:00 – 07:30, disponible/i }),
    ).toBeInTheDocument();
  });

  it('muestra un aviso cuando el día no tiene franjas libres, sin tratarlo como error', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce({
      ...MIXED_AVAILABILITY,
      slots: MIXED_AVAILABILITY.slots.map((slot) => ({
        ...slot,
        available: false,
        status: 'RESERVED',
      })),
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);

    expect(
      await screen.findByText('No hay franjas libres para este día. Prueba con otra fecha.'),
    ).toBeInTheDocument();
  });

  it('cambiar de día vuelve a consultar la disponibilidad manteniendo la instalación elegida (criterio 2 de US-032)', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);
    await screen.findByText('Disponibilidad — Cancha de fútbol 1');

    fetchResourceAvailabilityMock.mockResolvedValueOnce({
      ...MIXED_AVAILABILITY,
      date: '2026-08-13',
    });

    const dateInput = screen.getByLabelText('Día');
    fireEvent.change(dateInput, { target: { value: '2026-08-13' } });

    expect(await screen.findByText('Disponibilidad — Cancha de fútbol 1')).toBeInTheDocument();
    expect(fetchResourceAvailabilityMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ resourceId: 'futbol-1', date: '2026-08-13' }),
    );
  });
});

// --- Flujo completo de reserva (US-032) ---

const FULL_CATALOG: Resource[] = [FUTBOL_1, PARRILLA_1, PISCINA_SMALL];
const SLOT_LABEL = /franja 06:00 – 07:30, disponible/i;
const SLOT_START = '2026-08-12T11:00:00Z';

const CREATED_CONFIRMED = {
  reservationId: 'res-1',
  resourceId: 'futbol-1',
  reservationStatus: 'CONFIRMED' as const,
  startsAt: SLOT_START,
  endsAt: '2026-08-12T12:30:00Z',
  participantCount: 1,
  guestCount: 0,
};

type User = ReturnType<typeof userEvent.setup>;

async function chooseResourceAndSlot(
  user: User,
  resourceIndex = 0,
  resourceName = 'Cancha de fútbol 1',
) {
  await screen.findByText(resourceName);
  await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[resourceIndex]!);
  await user.click(await screen.findByRole('button', { name: SLOT_LABEL }));
}

async function searchDni(user: User, kind: 'socio' | 'invitado', dni: string) {
  if (kind === 'invitado') {
    await user.click(screen.getByRole('radio', { name: /invitado externo/i }));
  }
  await user.type(
    screen.getByLabelText(kind === 'socio' ? /dni del socio/i : /dni del invitado/i),
    dni,
  );
  await user.click(screen.getByRole('button', { name: /buscar/i }));
}

describe('ReservationsPage — reserva completa (US-032)', () => {
  beforeEach(() => {
    fetchMemberProfileMock.mockResolvedValue(HOLDER);
    fetchResourcesMock.mockResolvedValue(FULL_CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fetchResourcesMock.mockReset();
    fetchResourceAvailabilityMock.mockReset();
    fetchMemberProfileMock.mockReset();
    createReservationMock.mockReset();
    lookupMemberByDniMock.mockReset();
    lookupGuestByDniMock.mockReset();
    signOutMock.mockReset();
  });

  it('ya no muestra el aviso de "preparando la reserva"', async () => {
    renderPage();
    await screen.findByText('Cancha de fútbol 1');
    expect(screen.queryByText(/estamos preparando la reserva/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Consulta de disponibilidad')).not.toBeInTheDocument();
  });

  it('flujo feliz: reserva confirmada con el estado real del servidor y payload exacto', async () => {
    createReservationMock.mockResolvedValueOnce(CREATED_CONFIRMED);
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    expect(await screen.findByText('Resumen de tu reserva')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(
      await screen.findByRole('heading', { name: 'Tu reserva está confirmada' }),
    ).toBeInTheDocument();
    // Sin endsAt ni holderMemberId: no existen en el contrato de entrada.
    expect(createReservationMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      startsAt: SLOT_START,
      participants: [],
    });
  });

  it('parrilla: avisa la aprobación antes de confirmar y muestra "solicitud enviada" si queda PENDING_APPROVAL', async () => {
    createReservationMock.mockResolvedValueOnce({
      ...CREATED_CONFIRMED,
      resourceId: 'parrilla-1',
      reservationStatus: 'PENDING_APPROVAL',
    });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user, 1, 'Parrilla 1');

    expect(
      await screen.findByText(/requiere aprobación del administrador\. al confirmar/i),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enviar solicitud de reserva/i }));

    expect(
      await screen.findByRole('heading', { name: 'Solicitud enviada a revisión' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tu reserva está confirmada')).not.toBeInTheDocument();
  });

  it('agrega un socio por DNI usando el memberId del lookup y lo envía en la reserva', async () => {
    lookupMemberByDniMock.mockResolvedValueOnce({
      memberId: 'member-maria',
      firstName: 'María',
      lastName: 'Quispe',
    });
    createReservationMock.mockResolvedValueOnce({ ...CREATED_CONFIRMED, participantCount: 2 });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    await searchDni(user, 'socio', '45678912');
    expect(lookupMemberByDniMock).toHaveBeenCalledWith('45678912');
    await user.click(await screen.findByRole('button', { name: 'Agregar a María Quispe' }));

    const list = screen.getByRole('list', { name: /participantes agregados/i });
    expect(within(list).getByText('María Quispe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));
    await screen.findByRole('heading', { name: 'Tu reserva está confirmada' });
    expect(createReservationMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      startsAt: SLOT_START,
      participants: [{ type: 'MEMBER', memberId: 'member-maria' }],
    });
  });

  it('lookup de socio 404 DNI_NOT_FOUND: indica que no figura y ofrece agregarlo como invitado', async () => {
    lookupMemberByDniMock.mockRejectedValueOnce(
      new ApiRequestError(404, 'DNI_NOT_FOUND', 'No encontrado'),
    );
    lookupGuestByDniMock.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    await searchDni(user, 'socio', '70605040');
    expect(await screen.findByText(/no figura como socio del club/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /agregar como invitado externo/i }));

    // Invitado nuevo: se piden nombre y apellido.
    expect(await screen.findByLabelText('Nombre del invitado')).toBeInTheDocument();
    expect(lookupGuestByDniMock).toHaveBeenCalledWith('70605040');
  });

  it('invitado nuevo (guest lookup 404): pide nombre y apellido y los envía en la reserva', async () => {
    lookupGuestByDniMock.mockResolvedValueOnce(null);
    createReservationMock.mockResolvedValueOnce({
      ...CREATED_CONFIRMED,
      participantCount: 2,
      guestCount: 1,
    });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    await searchDni(user, 'invitado', '70605040');
    await user.type(await screen.findByLabelText('Nombre del invitado'), 'Ana');

    // Sin apellido no se puede agregar.
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    expect(await screen.findByText('Ingresa el apellido del invitado.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Apellido del invitado'), 'Torres');
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    await screen.findByRole('heading', { name: 'Tu reserva está confirmada' });
    expect(createReservationMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      startsAt: SLOT_START,
      participants: [{ type: 'GUEST', dni: '70605040', firstName: 'Ana', lastName: 'Torres' }],
    });
  });

  it('invitado existente: precarga el nombre registrado y no permite renombrarlo', async () => {
    lookupGuestByDniMock.mockResolvedValueOnce({
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    await searchDni(user, 'invitado', '70605040');

    expect(
      await screen.findByText(/el nombre registrado no se puede modificar/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Nombre del invitado')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar a Ana Torres' }));
    expect(
      within(screen.getByRole('list', { name: /participantes agregados/i })).getByText(
        'Ana Torres',
      ),
    ).toBeInTheDocument();
  });

  it('rechaza agregar al propio titular sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    // Espera a que el perfil (DNI del titular) esté cargado.
    await waitFor(() => expect(fetchMemberProfileMock).toHaveBeenCalled());
    await screen.findByText('Resumen de tu reserva');

    await searchDni(user, 'socio', HOLDER.dni);

    expect(await screen.findByText(/ese dni es el tuyo/i)).toBeInTheDocument();
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('anticipa el aforo: con aforo 3 solo admite dos acompañantes y lo explica', async () => {
    lookupMemberByDniMock
      .mockResolvedValueOnce({ memberId: 'm1', firstName: 'Ana', lastName: 'Uno' })
      .mockResolvedValueOnce({ memberId: 'm2', firstName: 'Beto', lastName: 'Dos' });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user, 2, 'Piscina chica');

    expect(
      screen.getByText(/aforo de 3 personas, es decir, tú más 2 acompañantes/i),
    ).toBeInTheDocument();

    await searchDni(user, 'socio', '22222222');
    await user.click(await screen.findByRole('button', { name: 'Agregar a Ana Uno' }));
    await user.type(screen.getByLabelText(/dni del socio/i), '33333333');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await user.click(await screen.findByRole('button', { name: 'Agregar a Beto Dos' }));

    expect(await screen.findByText(/alcanzaste el aforo de la instalación/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /buscar/i })).not.toBeInTheDocument();
  });

  it('permite quitar participantes antes de confirmar', async () => {
    lookupMemberByDniMock.mockResolvedValueOnce({
      memberId: 'member-maria',
      firstName: 'María',
      lastName: 'Quispe',
    });
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await searchDni(user, 'socio', '45678912');
    await user.click(await screen.findByRole('button', { name: 'Agregar a María Quispe' }));

    await user.click(screen.getByRole('button', { name: 'Quitar a María Quispe' }));

    expect(screen.queryByText('María Quispe')).not.toBeInTheDocument();
  });

  it.each([
    ['PARTICIPANT_OVERLAP', 409, /ya tiene una reserva activa que se superpone/i],
    ['CAPACITY_EXCEEDED', 422, /supera el aforo permitido/i],
    ['GUEST_MONTHLY_LIMIT', 429, /invitados externos ya tiene dos visitas este mes/i],
    ['OUTSIDE_SCHEDULE', 422, /fuera del horario de atención/i],
    ['VALIDATION_ERROR', 400, /algún dato de la reserva no es válido/i],
    ['MEMBERSHIP_REQUIRED', 422, /tu membresía debe estar vigente/i],
  ] as const)(
    'traduce el error %s a un mensaje accionable sin filtrar el del servidor',
    async (code, status, expected) => {
      createReservationMock.mockRejectedValueOnce(
        new ApiRequestError(status, code, 'mensaje-interno-del-servidor', [
          { field: 'secret', issue: 'detalle-interno' },
        ]),
      );
      const user = userEvent.setup();
      renderPage();
      await chooseResourceAndSlot(user);
      await user.click(await screen.findByRole('button', { name: /confirmar reserva/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(expected);
      expect(screen.queryByText(/mensaje-interno-del-servidor/)).not.toBeInTheDocument();
      expect(screen.queryByText(/detalle-interno/)).not.toBeInTheDocument();
    },
  );

  it('RESERVATION_OVERLAP: refresca la disponibilidad y conserva instalación y participantes', async () => {
    lookupGuestByDniMock.mockResolvedValueOnce({
      guestDni: '70605040',
      firstName: 'Ana',
      lastName: 'Torres',
    });
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'RESERVATION_OVERLAP', 'Ya reservado'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await searchDni(user, 'invitado', '70605040');
    await user.click(await screen.findByRole('button', { name: 'Agregar a Ana Torres' }));
    const callsBefore = fetchResourceAvailabilityMock.mock.calls.length;

    // La nueva disponibilidad ya muestra la franja tomada por otra reserva.
    fetchResourceAvailabilityMock.mockResolvedValue({
      ...MIXED_AVAILABILITY,
      slots: [
        { ...MIXED_AVAILABILITY.slots[0]!, available: false, status: 'RESERVED' as const },
        MIXED_AVAILABILITY.slots[1]!,
        {
          startsAt: '2026-08-12T15:30:00Z',
          endsAt: '2026-08-12T17:00:00Z',
          available: true,
          status: 'AVAILABLE' as const,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('Esa franja ya fue tomada')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchResourceAvailabilityMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    expect(
      await screen.findByRole('button', { name: /franja 06:00 – 07:30, ocupada/i }),
    ).toBeDisabled();
    // Instalación conservada.
    expect(screen.getByText('Disponibilidad — Cancha de fútbol 1')).toBeInTheDocument();

    // Al elegir otra franja, el participante sigue en la lista.
    await user.click(screen.getByRole('button', { name: /franja 10:30 – 12:00, disponible/i }));
    expect(
      within(screen.getByRole('list', { name: /participantes agregados/i })).getByText(
        'Ana Torres',
      ),
    ).toBeInTheDocument();
  });

  it('RESOURCE_IN_MAINTENANCE: mensaje específico y refresco de disponibilidad', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'RESOURCE_IN_MAINTENANCE', 'En mantenimiento'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    const callsBefore = fetchResourceAvailabilityMock.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('La instalación está en mantenimiento')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchResourceAvailabilityMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('MEMBER_HAS_DEBT devuelto por el servidor: mensaje claro y enlace al pago', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(422, 'MEMBER_HAS_DEBT', 'Deuda'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await user.click(await screen.findByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('Tienes un saldo pendiente')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a pagar mi membresía/i })).toHaveAttribute(
      'href',
      '/socio/membresia/pagar',
    );
  });

  it('fallo de red: ofrece reintentar y advierte que la reserva podría haberse creado', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await user.click(await screen.findByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText(/la reserva podría haberse creado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar reserva/i })).toBeEnabled();
  });

  it('sesión expirada al confirmar: cierra la sesión local para volver al login', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(401, 'UNAUTHENTICATED', 'Expirada'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await user.click(await screen.findByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('socio con deuda: aviso de bloqueo con enlace al pago y sin posibilidad de reservar', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...HOLDER,
      membershipStatus: 'DEBT',
      outstandingBalance: 5000,
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/tienes un saldo pendiente de membresía/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a pagar mi membresía/i })).toHaveAttribute(
      'href',
      '/socio/membresia/pagar',
    );

    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getAllByRole('button', { name: /ver disponibilidad/i })[0]!);
    await user.click(await screen.findByRole('button', { name: SLOT_LABEL }));

    expect(screen.queryByRole('button', { name: /confirmar reserva/i })).not.toBeInTheDocument();
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it('membresía vencida: aviso de bloqueo con enlace al pago', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...HOLDER, membershipStatus: 'EXPIRED' });
    renderPage();

    expect(await screen.findByText(/tu membresía no está vigente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a pagar mi membresía/i })).toBeInTheDocument();
  });

  it('doble clic en confirmar crea una sola reserva', async () => {
    let resolveCreate: (value: typeof CREATED_CONFIRMED) => void = () => {};
    createReservationMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);

    const confirmButton = await screen.findByRole('button', { name: /confirmar reserva/i });
    await user.dblClick(confirmButton);

    expect(createReservationMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled();

    resolveCreate(CREATED_CONFIRMED);
    expect(
      await screen.findByRole('heading', { name: 'Tu reserva está confirmada' }),
    ).toBeInTheDocument();
    expect(createReservationMock).toHaveBeenCalledTimes(1);
  });

  it('lookup con fallo de red muestra un mensaje y no agrega a nadie', async () => {
    lookupMemberByDniMock.mockRejectedValueOnce(
      new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar'),
    );
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await searchDni(user, 'socio', '45678912');

    expect(await screen.findByText(/no pudimos conectar con el servidor/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /participantes agregados/i }),
    ).not.toBeInTheDocument();
  });

  it('valida el formato del DNI antes de buscar', async () => {
    const user = userEvent.setup();
    renderPage();
    await chooseResourceAndSlot(user);
    await searchDni(user, 'socio', '123');

    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });
});
