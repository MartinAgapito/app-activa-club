// Página de reservas: catálogo de instalaciones (US-028, US-073) y asistente de
// reserva en ventana (US-072) que reorganiza el flujo de US-029 y US-032.
// Cubre: estados de carga/error/vacío, disponibilidad y franjas (libre,
// ocupada, en mantenimiento), navegación entre pasos conservando lo elegido,
// participantes y aforo, errores del servidor por paso, aprobación,
// bloqueo por deuda, cierre con confirmación, foco y direcciones con
// `?recurso` y `?tipo`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
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

function renderPage(initialEntry = '/socio/reservas') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ReservationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { queryClient, invalidateSpy };
}

function resetMocks() {
  vi.restoreAllMocks();
  fetchResourcesMock.mockReset();
  fetchResourceAvailabilityMock.mockReset();
  fetchMemberProfileMock.mockReset();
  createReservationMock.mockReset();
  lookupMemberByDniMock.mockReset();
  lookupGuestByDniMock.mockReset();
  signOutMock.mockReset();
}

type User = ReturnType<typeof userEvent.setup>;

/** Abre el asistente desde la tarjeta de la instalación (paso 2 preseleccionado). */
async function openFor(user: User, resourceName = 'Cancha de fútbol 1') {
  await screen.findByRole('heading', { name: resourceName });
  await user.click(screen.getByRole('button', { name: `Reservar ${resourceName}` }));
}

async function pickSlot(user: User) {
  await user.click(await screen.findByRole('button', { name: SLOT_LABEL }));
}

async function next(user: User) {
  await user.click(screen.getByRole('button', { name: 'Siguiente' }));
}

/** Hasta el paso 3 (participantes) con la primera franja elegida. */
async function toParticipants(user: User, resourceName?: string) {
  await openFor(user, resourceName);
  await pickSlot(user);
  await next(user);
}

/** Hasta el paso 4 (confirmar), sin participantes. */
async function toConfirm(user: User, resourceName?: string) {
  await toParticipants(user, resourceName);
  await next(user);
  await screen.findByText('Resumen de tu reserva');
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

async function addMember(user: User, dni: string, first: string, last: string, id: string) {
  lookupMemberByDniMock.mockResolvedValueOnce({ memberId: id, firstName: first, lastName: last });
  await searchDni(user, 'socio', dni);
  await user.click(await screen.findByRole('button', { name: `Agregar a ${first} ${last}` }));
}

describe('ReservationsPage — catálogo (US-028, US-073)', () => {
  beforeEach(() => {
    fetchMemberProfileMock.mockResolvedValue(HOLDER);
  });
  afterEach(resetMocks);

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
    expect(screen.getByRole('button', { name: 'Nueva reserva' })).toBeDisabled();
  });

  it('lista el catálogo con tipo, aforo, duración, horario y aprobación, marcando un recurso en mantenimiento (US-028, criterio 8)', async () => {
    fetchResourcesMock.mockResolvedValueOnce([FUTBOL_1, PISCINA_MAINTENANCE, PARRILLA_1]);
    renderPage();

    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
    expect(screen.getByText('14 personas')).toBeInTheDocument();
    expect(screen.getByText('90 min')).toBeInTheDocument();
    expect(screen.getByText('06:00 – 22:00')).toBeInTheDocument();

    // La piscina en mantenimiento sigue en el catálogo, marcada como tal, y
    // su botón "Reservar" sigue habilitado (US-073, criterio 3).
    expect(screen.getByRole('heading', { name: 'Piscina' })).toBeInTheDocument();
    expect(screen.getByText('En mantenimiento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reservar Piscina' })).toBeEnabled();

    expect(screen.getByText('Requiere aprobación del administrador')).toBeInTheDocument();
    // Ya no existe el botón "Ver disponibilidad": el catálogo abre el asistente.
    expect(screen.queryByRole('button', { name: /ver disponibilidad/i })).not.toBeInTheDocument();
  });

  it('al pulsar "Reservar" abre el asistente en el paso 2 y consulta la disponibilidad del día', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();

    await openFor(user);

    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    expect(within(dialog).getByText('Paso 2 de 4: Día y hora')).toBeInTheDocument();
    expect(
      within(dialog).getByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
    expect(fetchResourceAvailabilityMock).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'futbol-1' }),
    );
    expect(await within(dialog).findByRole('button', { name: SLOT_LABEL })).toBeInTheDocument();
  });

  it('distingue franja libre (seleccionable), ocupada y en mantenimiento, también con texto (US-029, criterio 11)', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();
    await openFor(user);

    const availableSlot = await screen.findByRole('button', {
      name: /franja 06:00 – 07:30, disponible/i,
    });
    const reservedSlot = screen.getByRole('button', { name: /franja 07:30 – 09:00, ocupada/i });
    const maintenanceSlot = screen.getByRole('button', {
      name: /franja 09:00 – 10:30, en mantenimiento/i,
    });

    expect(availableSlot).toBeEnabled();
    expect(reservedSlot).toBeDisabled();
    expect(maintenanceSlot).toBeDisabled();
    // El estado nunca depende solo del color: cada franja lo dice con texto.
    expect(within(availableSlot).getByText('Libre')).toBeInTheDocument();
    expect(within(reservedSlot).getByText('Ocupada')).toBeInTheDocument();
    expect(within(maintenanceSlot).getByText('En mantenimiento')).toBeInTheDocument();

    await user.click(availableSlot);
    expect(availableSlot).toHaveAttribute('aria-pressed', 'true');
    expect(within(availableSlot).getByText(/Elegida/)).toBeInTheDocument();

    await user.click(reservedSlot);
    expect(reservedSlot).toHaveAttribute('aria-pressed', 'false');
  });

  it('muestra un único aviso a nivel de recurso cuando el mantenimiento es indefinido, sin repetirlo franja por franja', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValueOnce(ALL_UNAVAILABLE_MAINTENANCE);
    const user = userEvent.setup();
    renderPage();

    await openFor(user, 'Piscina');

    expect(
      await screen.findByText(
        'Esta instalación está en mantenimiento y no admite reservas por el momento.',
      ),
    ).toBeInTheDocument();

    // Las franjas no repiten "En mantenimiento": solo queda el badge del
    // catálogo (el aviso de arriba ya lo explica).
    expect(screen.queryAllByText('En mantenimiento')).toHaveLength(1);
    expect(screen.getAllByText('No disponible')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('muestra el estado de carga de la disponibilidad', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockReturnValueOnce(new Promise(() => {}));
    const user = userEvent.setup();
    renderPage();
    await openFor(user);

    expect(await screen.findByText('Cargando la disponibilidad del día…')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintento si falla la disponibilidad, dentro de la ventana', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockRejectedValueOnce(
      new ApiRequestError(404, 'NOT_FOUND', 'No encontramos esa instalación.'),
    );
    const user = userEvent.setup();
    renderPage();
    await openFor(user);

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
    await openFor(user);

    expect(
      await screen.findByText('No hay franjas libres para este día. Prueba con otra fecha.'),
    ).toBeInTheDocument();
  });

  it('cambiar de día (fila de días) vuelve a consultar manteniendo la instalación (criterio 2 de US-032)', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();
    await openFor(user);
    await pickSlot(user);

    const days = within(screen.getByRole('group', { name: 'Elige un día' })).getAllByRole('button');
    expect(days).toHaveLength(14);
    expect(days[0]).toHaveAttribute('aria-pressed', 'true');
    await user.click(days[1]!);

    await waitFor(() =>
      expect(fetchResourceAvailabilityMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ resourceId: 'futbol-1' }),
      ),
    );
    expect(days[1]).toHaveAttribute('aria-pressed', 'true');
    // Otro día: la franja elegida se descarta.
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('permite elegir otra fecha con el campo de fecha', async () => {
    fetchResourcesMock.mockResolvedValueOnce(CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
    const user = userEvent.setup();
    renderPage();
    await openFor(user);
    await screen.findByRole('button', { name: SLOT_LABEL });

    fireEvent.change(screen.getByLabelText('Otra fecha'), { target: { value: '2026-12-24' } });

    await waitFor(() =>
      expect(fetchResourceAvailabilityMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ resourceId: 'futbol-1', date: '2026-12-24' }),
      ),
    );
  });
});

describe('ReservationsPage — asistente de reserva (US-072, US-032)', () => {
  beforeEach(() => {
    fetchMemberProfileMock.mockResolvedValue(HOLDER);
    fetchResourcesMock.mockResolvedValue(FULL_CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
  });
  afterEach(resetMocks);

  it('ya no muestra el aviso de "preparando la reserva"', async () => {
    renderPage();
    await screen.findByText('Cancha de fútbol 1');
    expect(screen.queryByText(/estamos preparando la reserva/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Consulta de disponibilidad')).not.toBeInTheDocument();
  });

  it('"Nueva reserva" abre el asistente en el paso 1 y "Siguiente" solo se habilita con el paso completo (criterios 1 y 6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Cancha de fútbol 1');
    await user.click(screen.getByRole('button', { name: 'Nueva reserva' }));

    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    expect(within(dialog).getByText('Paso 1 de 4: Instalación')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    // Desde el primer paso no hay "Atrás": hay "Cancelar".
    expect(within(dialog).queryByRole('button', { name: 'Atrás' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Piscina chica/ }));
    expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toBeEnabled();
    await user.click(within(dialog).getByRole('button', { name: 'Siguiente' }));

    expect(
      within(dialog).getByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  it('"Atrás" conserva instalación, franja, participantes y notas en todo el recorrido (criterio 6)', async () => {
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await addMember(user, '45678912', 'María', 'Quispe', 'member-maria');
    await next(user);
    await user.type(screen.getByLabelText(/notas/i), 'Cumpleaños');

    // 4 -> 3: el participante sigue.
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(
      within(screen.getByRole('list', { name: /participantes agregados/i })).getByText(
        'María Quispe',
      ),
    ).toBeInTheDocument();

    // 3 -> 2: la franja sigue elegida.
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(await screen.findByRole('button', { name: SLOT_LABEL })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // 2 -> 1: la instalación sigue elegida.
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    expect(screen.getByRole('button', { name: /Cancha de fútbol 1/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // De vuelta al resumen: todo intacto, incluidas las notas.
    await next(user);
    await next(user);
    await next(user);
    expect(await screen.findByText(/tú, María Quispe/)).toBeInTheDocument();
    expect(screen.getByLabelText(/notas/i)).toHaveValue('Cumpleaños');
  });

  it('el Stepper permite volver a un paso completado y "Atrás" está visible (móvil)', async () => {
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user);

    expect(screen.getByRole('button', { name: 'Atrás' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Día y hora/ }));

    expect(
      await screen.findByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: SLOT_LABEL })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('cambiar de instalación descarta la franja, conserva participantes y avisa si exceden el aforo (criterio 7)', async () => {
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await addMember(user, '22222222', 'Ana', 'Uno', 'm1');
    await user.type(screen.getByLabelText(/dni del socio/i), '33333333');
    lookupMemberByDniMock.mockResolvedValueOnce({
      memberId: 'm2',
      firstName: 'Beto',
      lastName: 'Dos',
    });
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await user.click(await screen.findByRole('button', { name: 'Agregar a Beto Dos' }));
    await user.type(screen.getByLabelText(/dni del socio/i), '44444444');
    lookupMemberByDniMock.mockResolvedValueOnce({
      memberId: 'm3',
      firstName: 'Carla',
      lastName: 'Tres',
    });
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await user.click(await screen.findByRole('button', { name: 'Agregar a Carla Tres' }));

    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    await user.click(screen.getByRole('button', { name: 'Atrás' }));
    await user.click(screen.getByRole('button', { name: /Piscina chica/ }));

    // Aforo 3 = titular + 2: con 3 acompañantes se avisa, sin perder la lista.
    expect(screen.getByRole('status')).toHaveTextContent(/admite hasta 2 acompañantes/i);
    await next(user);
    // La franja se descartó al cambiar de instalación.
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    await pickSlot(user);
    await next(user);

    expect(screen.getByText('Ana Uno')).toBeInTheDocument();
    expect(screen.getByText('Carla Tres')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/solo caben 2 acompañantes/i);

    await user.click(screen.getByRole('button', { name: 'Quitar a Carla Tres' }));
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeEnabled();
  });

  it('flujo feliz: reserva confirmada con payload exacto, aviso, cierre y refresco (criterio 9)', async () => {
    createReservationMock.mockResolvedValueOnce(CREATED_CONFIRMED);
    const user = userEvent.setup();
    const { invalidateSpy } = renderPage();
    await toConfirm(user);

    expect(screen.getByText(/confirmación inmediata/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('Reserva confirmada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver en Mis reservas' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Sin endsAt ni holderMemberId: no existen en el contrato de entrada.
    expect(createReservationMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      startsAt: SLOT_START,
      participants: [],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['reservations'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['resources', 'futbol-1', 'availability'],
    });
  });

  it('parrilla: avisa la aprobación antes de confirmar y avisa "Solicitud enviada" si queda PENDING_APPROVAL', async () => {
    createReservationMock.mockResolvedValueOnce({
      ...CREATED_CONFIRMED,
      resourceId: 'parrilla-1',
      reservationStatus: 'PENDING_APPROVAL',
    });
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user, 'Parrilla 1');

    expect(
      await screen.findByText(/requiere aprobación del administrador\. al confirmar/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/confirmación inmediata/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /enviar solicitud de reserva/i }));

    expect(await screen.findByText('Solicitud enviada a revisión')).toBeInTheDocument();
    expect(screen.queryByText('Reserva confirmada')).not.toBeInTheDocument();
  });

  it('agrega un socio por DNI usando el memberId del lookup y lo envía en la reserva', async () => {
    createReservationMock.mockResolvedValueOnce({ ...CREATED_CONFIRMED, participantCount: 2 });
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);

    lookupMemberByDniMock.mockResolvedValueOnce({
      memberId: 'member-maria',
      firstName: 'María',
      lastName: 'Quispe',
    });
    await searchDni(user, 'socio', '45678912');
    expect(lookupMemberByDniMock).toHaveBeenCalledWith('45678912');
    // El nombre del socio se muestra para confirmar antes de agregarlo.
    expect(await screen.findByText('María Quispe', { selector: 'strong' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Agregar a María Quispe' }));

    const list = screen.getByRole('list', { name: /participantes agregados/i });
    expect(within(list).getByText('María Quispe')).toBeInTheDocument();
    expect(screen.getByTestId('capacity-counter')).toHaveTextContent('2 de 14');

    await next(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));
    await screen.findByText('Reserva confirmada');
    expect(createReservationMock).toHaveBeenCalledWith({
      resourceId: 'futbol-1',
      startsAt: SLOT_START,
      participants: [{ type: 'MEMBER', memberId: 'member-maria' }],
    });
  });

  it('"Reservar solo para mí" salta al resumen sin participantes (criterio 4)', async () => {
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);

    await user.click(screen.getByRole('button', { name: 'Reservar solo para mí' }));

    expect(await screen.findByText('Resumen de tu reserva')).toBeInTheDocument();
  });

  it('lookup de socio 404 DNI_NOT_FOUND: indica que no figura y ofrece agregarlo como invitado', async () => {
    lookupMemberByDniMock.mockRejectedValueOnce(
      new ApiRequestError(404, 'DNI_NOT_FOUND', 'No encontrado'),
    );
    lookupGuestByDniMock.mockResolvedValueOnce(null);
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);

    await searchDni(user, 'socio', '70605040');
    expect(await screen.findByText(/no figura como socio del club/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /agregar como invitado externo/i }));

    // Invitado nuevo: se piden nombre y apellido.
    expect(await screen.findByLabelText('Nombre del invitado')).toBeInTheDocument();
    expect(lookupGuestByDniMock).toHaveBeenCalledWith('70605040');
  });

  it('invitado nuevo (guest lookup 404): pide nombre y apellido, informa el límite mensual y los envía', async () => {
    lookupGuestByDniMock.mockResolvedValueOnce(null);
    createReservationMock.mockResolvedValueOnce({
      ...CREATED_CONFIRMED,
      participantCount: 2,
      guestCount: 1,
    });
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);

    await searchDni(user, 'invitado', '70605040');
    expect(screen.getByText(/hasta 2 veces al mes/i)).toBeInTheDocument();
    await user.type(await screen.findByLabelText('Nombre del invitado'), 'Ana');

    // Sin apellido no se puede agregar.
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    expect(await screen.findByText('Ingresa el apellido del invitado.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Apellido del invitado'), 'Torres');
    await user.click(screen.getByRole('button', { name: 'Agregar invitado' }));
    await next(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    await screen.findByText('Reserva confirmada');
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
    await toParticipants(user);

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
    await toParticipants(user);
    await waitFor(() => expect(fetchMemberProfileMock).toHaveBeenCalled());

    await searchDni(user, 'socio', HOLDER.dni);

    expect(await screen.findByText(/ese dni es el tuyo/i)).toBeInTheDocument();
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });

  it('anticipa el aforo: con aforo 3 solo admite dos acompañantes, lo explica y muestra el contador', async () => {
    lookupMemberByDniMock
      .mockResolvedValueOnce({ memberId: 'm1', firstName: 'Ana', lastName: 'Uno' })
      .mockResolvedValueOnce({ memberId: 'm2', firstName: 'Beto', lastName: 'Dos' });
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user, 'Piscina chica');

    expect(
      screen.getByText(/aforo de 3 personas, es decir, tú más 2 acompañantes/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId('capacity-counter')).toHaveTextContent('1 de 3');

    await searchDni(user, 'socio', '22222222');
    await user.click(await screen.findByRole('button', { name: 'Agregar a Ana Uno' }));
    await user.type(screen.getByLabelText(/dni del socio/i), '33333333');
    await user.click(screen.getByRole('button', { name: /buscar/i }));
    await user.click(await screen.findByRole('button', { name: 'Agregar a Beto Dos' }));

    expect(await screen.findByText(/alcanzaste el aforo de la instalación/i)).toBeInTheDocument();
    expect(screen.getByTestId('capacity-counter')).toHaveTextContent('3 de 3');
    expect(screen.queryByRole('button', { name: /buscar/i })).not.toBeInTheDocument();
  });

  it('permite quitar participantes antes de confirmar', async () => {
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await addMember(user, '45678912', 'María', 'Quispe', 'member-maria');

    await user.click(screen.getByRole('button', { name: 'Quitar a María Quispe' }));

    expect(screen.queryByText('María Quispe')).not.toBeInTheDocument();
    expect(screen.getByTestId('capacity-counter')).toHaveTextContent('1 de 14');
  });

  it.each([
    ['PARTICIPANT_OVERLAP', 409, /ya tiene una reserva activa que se superpone/i, 'Participantes'],
    ['CAPACITY_EXCEEDED', 422, /supera el aforo permitido/i, 'Participantes'],
    [
      'GUEST_MONTHLY_LIMIT',
      429,
      /invitados externos ya tiene dos visitas este mes/i,
      'Participantes',
    ],
    ['OUTSIDE_SCHEDULE', 422, /fuera del horario de atención/i, 'Día y hora'],
    ['VALIDATION_ERROR', 400, /algún dato de la reserva no es válido/i, 'Confirmar'],
    ['MEMBERSHIP_REQUIRED', 422, /tu membresía debe estar vigente/i, 'Confirmar'],
  ] as const)(
    'traduce el error %s, lo muestra en el paso correcto sin cerrar la ventana y sin filtrar el del servidor',
    async (code, status, expected, stepLabel) => {
      createReservationMock.mockRejectedValueOnce(
        new ApiRequestError(status, code, 'mensaje-interno-del-servidor', [
          { field: 'secret', issue: 'detalle-interno' },
        ]),
      );
      const user = userEvent.setup();
      renderPage();
      await toConfirm(user);
      await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(expected);
      expect(screen.getByRole('dialog', { name: 'Nueva reserva' })).toBeInTheDocument();
      expect(screen.getByText(new RegExp(`: ${stepLabel}$`))).toBeInTheDocument();
      expect(screen.queryByText(/mensaje-interno-del-servidor/)).not.toBeInTheDocument();
      expect(screen.queryByText(/detalle-interno/)).not.toBeInTheDocument();
    },
  );

  it('PARTICIPANT_OVERLAP: vuelve al paso 3 conservando participantes y ofrece elegir otro horario', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'PARTICIPANT_OVERLAP', 'Solape'),
    );
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await addMember(user, '45678912', 'María', 'Quispe', 'member-maria');
    await next(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /un participante ya tiene otra reserva/i,
    );
    expect(screen.getByText('María Quispe')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Elegir otro horario' }));
    expect(
      await screen.findByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
  });

  it('RESERVATION_OVERLAP: vuelve al paso 2 con la disponibilidad refrescada y conserva instalación y participantes', async () => {
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
    await toParticipants(user);
    await searchDni(user, 'invitado', '70605040');
    await user.click(await screen.findByRole('button', { name: 'Agregar a Ana Torres' }));
    await next(user);
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
    expect(
      await screen.findByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchResourceAvailabilityMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    expect(
      await screen.findByRole('button', { name: /franja 06:00 – 07:30, ocupada/i }),
    ).toBeDisabled();
    // La franja tomada ya no cuenta como elegida.
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    // Al elegir otra franja, el participante sigue en la lista.
    await user.click(
      await screen.findByRole('button', { name: /franja 10:30 – 12:00, disponible/i }),
    );
    await next(user);
    expect(
      within(screen.getByRole('list', { name: /participantes agregados/i })).getByText(
        'Ana Torres',
      ),
    ).toBeInTheDocument();
  });

  it('RESOURCE_IN_MAINTENANCE: mensaje específico, paso 2 y refresco de disponibilidad', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'RESOURCE_IN_MAINTENANCE', 'En mantenimiento'),
    );
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user);
    const callsBefore = fetchResourceAvailabilityMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('La instalación está en mantenimiento')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Elige el día y la hora' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchResourceAvailabilityMock.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it('MEMBER_HAS_DEBT devuelto por el servidor: mensaje claro y enlace al pago dentro de la ventana', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(422, 'MEMBER_HAS_DEBT', 'Deuda'),
    );
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

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
    await toConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText(/la reserva podría haberse creado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirmar reserva/i })).toBeEnabled();
  });

  it('sesión expirada al confirmar: cierra la sesión local para volver al login', async () => {
    createReservationMock.mockRejectedValueOnce(
      new ApiRequestError(401, 'UNAUTHENTICATED', 'Expirada'),
    );
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user);
    await user.click(screen.getByRole('button', { name: /confirmar reserva/i }));

    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('doble clic en confirmar crea una sola reserva y la ventana no se cierra mientras tanto (criterio 11)', async () => {
    let resolveCreate: (value: typeof CREATED_CONFIRMED) => void = () => {};
    createReservationMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await toConfirm(user);

    const confirmButton = screen.getByRole('button', { name: /confirmar reserva/i });
    await user.dblClick(confirmButton);

    expect(createReservationMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /enviando/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Atrás' })).toBeDisabled();

    // Escape y Cerrar no cierran la ventana con la petición en curso.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Nueva reserva' })).toBeInTheDocument();
    expect(screen.queryByText('¿Descartar esta reserva?')).not.toBeInTheDocument();

    resolveCreate(CREATED_CONFIRMED);
    expect(await screen.findByText('Reserva confirmada')).toBeInTheDocument();
    expect(createReservationMock).toHaveBeenCalledTimes(1);
  });

  it('lookup con fallo de red muestra un mensaje y no agrega a nadie', async () => {
    lookupMemberByDniMock.mockRejectedValueOnce(
      new ApiRequestError(0, 'NETWORK_ERROR', 'No se pudo conectar'),
    );
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await searchDni(user, 'socio', '45678912');

    expect(await screen.findByText(/no pudimos conectar con el servidor/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('list', { name: /participantes agregados/i }),
    ).not.toBeInTheDocument();
  });

  it('valida el formato del DNI antes de buscar', async () => {
    const user = userEvent.setup();
    renderPage();
    await toParticipants(user);
    await searchDni(user, 'socio', '123');

    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
    expect(lookupMemberByDniMock).not.toHaveBeenCalled();
  });
});

describe('ReservationsPage — acceso con deuda o membresía vencida (criterio 12)', () => {
  beforeEach(() => {
    fetchResourcesMock.mockResolvedValue(FULL_CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
  });
  afterEach(resetMocks);

  it('socio con deuda: aviso con enlace al pago y botones de reserva deshabilitados', async () => {
    fetchMemberProfileMock.mockResolvedValue({
      ...HOLDER,
      membershipStatus: 'DEBT',
      outstandingBalance: 5000,
    });
    renderPage();

    expect(await screen.findByText(/tienes un saldo pendiente de membresía/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a pagar mi membresía/i })).toHaveAttribute(
      'href',
      '/socio/membresia/pagar',
    );

    await screen.findByText('Cancha de fútbol 1');
    expect(screen.getByRole('button', { name: 'Nueva reserva' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reservar Cancha de fútbol 1' })).toBeDisabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createReservationMock).not.toHaveBeenCalled();
  });

  it('membresía vencida: aviso de bloqueo con enlace al pago', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...HOLDER, membershipStatus: 'EXPIRED' });
    renderPage();

    expect(await screen.findByText(/tu membresía no está vigente/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a pagar mi membresía/i })).toBeInTheDocument();
  });

  it('deep link con deuda: el asistente muestra el bloqueo con enlace al pago en lugar de los pasos', async () => {
    fetchMemberProfileMock.mockResolvedValue({ ...HOLDER, membershipStatus: 'EXPIRED' });
    renderPage('/socio/reservas?recurso=futbol-1');

    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    await waitFor(() =>
      expect(within(dialog).getByText(/tu membresía no está vigente/i)).toBeInTheDocument(),
    );
    expect(
      within(dialog).getByRole('link', { name: /ir a pagar mi membresía/i }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
  });
});

describe('ReservationsPage — cierre, foco y direcciones (US-072 criterios 13-14, US-073)', () => {
  beforeEach(() => {
    fetchMemberProfileMock.mockResolvedValue(HOLDER);
    fetchResourcesMock.mockResolvedValue(FULL_CATALOG);
    fetchResourceAvailabilityMock.mockResolvedValue(MIXED_AVAILABILITY);
  });
  afterEach(resetMocks);

  it('Escape sin nada elegido cierra directamente y devuelve el foco al botón que abrió la ventana', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFor(user);
    await screen.findByRole('button', { name: SLOT_LABEL });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reservar Cancha de fútbol 1' })).toHaveFocus();
  });

  it('al abrir y al cambiar de paso el foco va al encabezado del paso', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFor(user);

    const heading = await screen.findByRole('heading', { name: 'Elige el día y la hora' });
    await waitFor(() => expect(heading).toHaveFocus());

    await pickSlot(user);
    await next(user);
    const participants = await screen.findByRole('heading', { name: 'Agrega a tus participantes' });
    await waitFor(() => expect(participants).toHaveFocus());
  });

  it('con algo elegido, Escape pide confirmación: "Seguir reservando" conserva y "Descartar" cierra', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFor(user);
    await pickSlot(user);

    await user.keyboard('{Escape}');
    expect(await screen.findByText('¿Descartar esta reserva?')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Nueva reserva' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Seguir reservando' }));
    expect(screen.queryByText('¿Descartar esta reserva?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: SLOT_LABEL })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('reabrir el asistente empieza con un borrador limpio', async () => {
    const user = userEvent.setup();
    renderPage();
    await openFor(user);
    await pickSlot(user);
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Reservar Cancha de fútbol 1' }));

    expect(await screen.findByRole('button', { name: SLOT_LABEL })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('?recurso=<id> abre el asistente en el paso 2 con esa instalación', async () => {
    renderPage('/socio/reservas?recurso=piscina-2');

    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    expect(within(dialog).getByText('Paso 2 de 4: Día y hora')).toBeInTheDocument();
    expect(within(dialog).getByText('Piscina chica')).toBeInTheDocument();
    await waitFor(() =>
      expect(fetchResourceAvailabilityMock).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: 'piscina-2' }),
      ),
    );
  });

  it('?recurso inexistente muestra el catálogo con un aviso', async () => {
    renderPage('/socio/reservas?recurso=no-existe');

    expect(await screen.findByText(/no encontramos esa instalación/i)).toBeInTheDocument();
    expect(screen.getByText('Cancha de fútbol 1')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('?tipo filtra el catálogo y, con una sola instalación del tipo, abre el asistente', async () => {
    renderPage('/socio/reservas?tipo=PISCINA');

    const dialog = await screen.findByRole('dialog', { name: 'Nueva reserva' });
    expect(within(dialog).getByText('Piscina chica')).toBeInTheDocument();
  });

  it('?tipo con varias instalaciones muestra solo ese tipo, sin abrir el asistente', async () => {
    fetchResourcesMock.mockResolvedValue([
      FUTBOL_1,
      { ...FUTBOL_1, resourceId: 'futbol-2', name: 'Cancha de fútbol 2' },
      PARRILLA_1,
    ]);
    renderPage('/socio/reservas?tipo=FUTBOL');

    expect(await screen.findByRole('heading', { name: 'Cancha de fútbol 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cancha de fútbol 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Parrilla 1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
