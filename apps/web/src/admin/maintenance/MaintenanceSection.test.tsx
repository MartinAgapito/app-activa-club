// Bloqueos por mantenimiento (US-035 criterios 10, 11 y 13): crear con hora de
// Lima enviada en UTC, mostrar reservas afectadas, listar y liberar.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MaintenanceBlock, Resource } from '@activa-club/shared-types';
import { MaintenanceSection } from './MaintenanceSection';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchResourcesMock, createMock, listMock, releaseMock, signOutMock } = vi.hoisted(() => ({
  fetchResourcesMock: vi.fn(),
  createMock: vi.fn(),
  listMock: vi.fn(),
  releaseMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

vi.mock('./admin-maintenance-client', () => ({
  createMaintenanceBlock: createMock,
  listMaintenanceBlocks: listMock,
  releaseMaintenanceBlock: releaseMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

const PISCINA: Resource = {
  resourceId: 'piscina-1',
  type: 'PISCINA',
  name: 'Piscina',
  capacity: 40,
  blockMinutes: 60,
  opensAt: '06:00',
  closesAt: '20:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

const TENIS: Resource = {
  resourceId: 'tenis-1',
  type: 'TENIS',
  name: 'Cancha de tenis 1',
  capacity: 4,
  blockMinutes: 60,
  opensAt: '06:00',
  closesAt: '22:00',
  requiresApproval: false,
  resourceStatus: 'AVAILABLE',
};

function block(overrides: Partial<MaintenanceBlock> = {}): MaintenanceBlock {
  return {
    blockId: 'blk-1',
    resourceId: 'piscina-1',
    // 13:00Z = 08:00 en Lima.
    startsAt: '2026-07-20T13:00:00.000Z',
    endsAt: '2026-07-20T18:00:00.000Z',
    reason: 'Limpieza de piscina',
    createdBy: 'admin-sub',
    createdAt: '2026-07-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MaintenanceSection />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<'start' | 'end', [string, string]>> & { reason?: string } = {},
) {
  const form = await screen.findByRole('form', { name: 'Nuevo bloqueo por mantenimiento' });
  await within(form).findByRole('option', { name: 'Piscina' });
  await user.selectOptions(within(form).getByLabelText(/Instalación/), 'piscina-1');
  const [startDate, startTime] = overrides.start ?? ['2026-07-20', '08:00'];
  const [endDate, endTime] = overrides.end ?? ['2026-07-20', '13:00'];
  await user.type(within(form).getByLabelText(/Fecha de inicio/), startDate);
  await user.type(within(form).getByLabelText(/Hora de inicio/), startTime);
  await user.type(within(form).getByLabelText(/Fecha de fin/), endDate);
  await user.type(within(form).getByLabelText(/Hora de fin/), endTime);
  if (overrides.reason) {
    await user.type(within(form).getByLabelText(/Motivo/), overrides.reason);
  }
  return form;
}

describe('MaintenanceSection', () => {
  beforeEach(() => {
    fetchResourcesMock.mockResolvedValue([PISCINA, TENIS]);
    listMock.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('documenta que las reservas existentes no se cancelan solas', async () => {
    renderSection();
    expect(
      await screen.findByText('Las reservas existentes no se cancelan solas'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reservas' })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
  });

  it('muestra carga y estado vacío de los bloqueos', async () => {
    listMock.mockReturnValueOnce(new Promise(() => undefined));
    renderSection();
    expect(await screen.findByText('Cargando bloqueos…')).toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay bloqueos', async () => {
    renderSection();
    expect(await screen.findByText('Sin bloqueos vigentes')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith('piscina-1');
  });

  it('lista los bloqueos con ventana en hora de Lima y motivo', async () => {
    listMock.mockResolvedValue({
      items: [block(), block({ blockId: 'blk-2', reason: null })],
    });
    renderSection();

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(/08:00/)).toBeInTheDocument();
    expect(within(items[0]!).getByText('Limpieza de piscina')).toBeInTheDocument();
    expect(within(items[1]!).getByText('Sin motivo indicado')).toBeInTheDocument();
  });

  it('consulta los bloqueos de otra instalación', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Sin bloqueos vigentes');

    await user.selectOptions(screen.getByLabelText('Ver bloqueos de'), 'tenis-1');

    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('tenis-1'));
  });

  it('crea el bloqueo enviando la hora de Lima en UTC y muestra reservas afectadas', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      blockId: 'blk-9',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: 'Limpieza',
      affectedReservationCount: 2,
    });
    renderSection();
    const form = await fillForm(user, { reason: 'Limpieza' });

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('piscina-1', {
        // 08:00 y 13:00 de Lima.
        startsAt: '2026-07-20T13:00:00Z',
        endsAt: '2026-07-20T18:00:00Z',
        reason: 'Limpieza',
      }),
    );
    expect(await screen.findByText('Bloqueo creado')).toBeInTheDocument();
    expect(screen.getByText('2 reservas activas quedan dentro de la ventana')).toBeInTheDocument();
    expect(screen.getByText(/No se cancelan solas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a reservas' })).toHaveAttribute(
      'href',
      '/admin/reservas',
    );
  });

  it('omite el motivo si queda vacío y avisa cuando no hay reservas afectadas', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      blockId: 'blk-9',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: null,
      affectedReservationCount: 0,
    });
    renderSection();
    const form = await fillForm(user);

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('piscina-1', {
        startsAt: '2026-07-20T13:00:00Z',
        endsAt: '2026-07-20T18:00:00Z',
      }),
    );
    expect(
      await screen.findByText('Ninguna reserva activa queda dentro de la ventana bloqueada.'),
    ).toBeInTheDocument();
  });

  it('exige instalación, fechas y horas antes de enviar', async () => {
    const user = userEvent.setup();
    renderSection();
    const form = await screen.findByRole('form', { name: 'Nuevo bloqueo por mantenimiento' });

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    expect(await within(form).findByText('Elige una instalación.')).toBeInTheDocument();
    expect(within(form).getByText('Elige la fecha de inicio.')).toBeInTheDocument();
    expect(within(form).getByText('Elige la hora de fin.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza un fin anterior o igual al inicio sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderSection();
    const form = await fillForm(user, {
      start: ['2026-07-20', '13:00'],
      end: ['2026-07-20', '08:00'],
    });

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    expect(
      await within(form).findByText('El fin debe ser posterior al inicio.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('limita el motivo a 280 caracteres', async () => {
    const user = userEvent.setup();
    renderSection();
    const form = await fillForm(user);
    const reason = within(form).getByLabelText(/Motivo/);
    await user.click(reason);
    await user.paste('a'.repeat(281));

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    expect(
      await within(form).findByText('El motivo admite hasta 280 caracteres.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it.each([
    ['VALIDATION_ERROR', 'El servidor no aceptó el bloqueo'],
    ['NOT_FOUND', 'No encontramos la instalación'],
    ['FORBIDDEN', 'No tienes permiso para esta acción'],
    ['NETWORK_ERROR', 'No pudimos conectar con el servidor'],
    ['INTERNAL_ERROR', 'No pudimos crear el bloqueo'],
  ] as const)('traduce el error %s al crear sin mensaje crudo', async (code, text) => {
    const user = userEvent.setup();
    createMock.mockRejectedValue(new ApiRequestError(400, code, 'mensaje crudo'));
    renderSection();
    const form = await fillForm(user);

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    const alert = await screen.findByText(text);
    expect(alert).toBeInTheDocument();
    expect(screen.queryByText(/mensaje crudo/)).not.toBeInTheDocument();
  });

  it('cierra la sesión si el token expiró al crear', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
    renderSection();
    const form = await fillForm(user);

    await user.click(within(form).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
  });

  it('libera un bloqueo con confirmación (204 sin cuerpo) y refresca la lista', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce({ items: [block()] }).mockResolvedValue({ items: [] });
    releaseMock.mockResolvedValue(undefined);
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Liberar bloqueo/ }));
    const dialog = screen.getByRole('alertdialog');
    expect(releaseMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Sí, liberar bloqueo' }));

    await waitFor(() => expect(releaseMock).toHaveBeenCalledWith('piscina-1', 'blk-1'));
    expect(await screen.findByText('Bloqueo liberado')).toBeInTheDocument();
    expect(await screen.findByText('Sin bloqueos vigentes')).toBeInTheDocument();
  });

  it('permite mantener el bloqueo sin llamar al servidor', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: [block()] });
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Liberar bloqueo/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Mantener bloqueo' }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('404 al liberar avisa que ya no existe y refresca', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: [block()] });
    releaseMock.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'crudo'));
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Liberar bloqueo/ }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sí, liberar bloqueo' }),
    );

    expect(await screen.findByText('El bloqueo ya no existe')).toBeInTheDocument();
    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
  });

  it('muestra el error de carga de bloqueos sin mensaje crudo y reintenta', async () => {
    const user = userEvent.setup();
    listMock
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'detalle interno'))
      .mockResolvedValue({ items: [block()] });
    renderSection();

    expect(await screen.findByText('No pudimos cargar los bloqueos')).toBeInTheDocument();
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Limpieza de piscina')).toBeInTheDocument();
  });
});
