// Catálogo de instalaciones (US-028) y selector de franjas horarias (US-029)
// — Ola 1 del Sprint 3, preparación de US-032. Cubre: estados de
// carga/error/vacío del catálogo y de la disponibilidad, selección de
// instalación y de día, y el renderizado distinguible de las tres
// situaciones de una franja (libre/seleccionable, ocupada y en
// mantenimiento), más el aviso a nivel de recurso cuando el mantenimiento es
// indefinido.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AvailabilityResponse, Resource } from '@activa-club/shared-types';
import { ReservationsPage } from './ReservationsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchResourcesMock, fetchResourceAvailabilityMock } = vi.hoisted(() => ({
  fetchResourcesMock: vi.fn(),
  fetchResourceAvailabilityMock: vi.fn(),
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

const CATALOG: Resource[] = [FUTBOL_1, PISCINA_MAINTENANCE];

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
      <ReservationsPage />
    </QueryClientProvider>,
  );
}

describe('ReservationsPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchResourcesMock.mockReset();
    fetchResourceAvailabilityMock.mockReset();
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
