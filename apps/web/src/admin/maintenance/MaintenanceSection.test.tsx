// Bloqueos por mantenimiento (US-035 criterios 10, 11 y 13, reorganizado en
// US-076): crear en una ventana con hora de Lima enviada en UTC, avisar de las
// reservas afectadas, listar en tabla y liberar con confirmación.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
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

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderSection(initialEntry = '/admin/recursos?tab=mantenimiento') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <MaintenanceSection />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** Abre la ventana de nuevo bloqueo y devuelve ventana y formulario. */
async function openNewBlock(user: ReturnType<typeof userEvent.setup>) {
  // La cabecera y el estado vacío ofrecen "Nuevo bloqueo": se usa el primero.
  const buttons = await screen.findAllByRole('button', { name: 'Nuevo bloqueo' });
  await user.click(buttons[0]!);
  const dialog = await screen.findByRole('dialog', { name: 'Nuevo bloqueo por mantenimiento' });
  const form = within(dialog).getByRole('form', { name: 'Nuevo bloqueo por mantenimiento' });
  return { dialog, form };
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<Record<'start' | 'end', [string, string]>> & { reason?: string } = {},
) {
  const { dialog, form } = await openNewBlock(user);
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
  return { dialog, form };
}

describe('MaintenanceSection', () => {
  beforeEach(() => {
    // Solo `Date`: el formulario rechaza inicios en el pasado y las fechas de
    // las pruebas (julio de 2026) deben ser futuras sin frenar los temporizadores.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-01T15:00:00.000Z'));
    fetchResourcesMock.mockResolvedValue([PISCINA, TENIS]);
    listMock.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('muestra carga de los bloqueos', async () => {
    listMock.mockReturnValueOnce(new Promise(() => undefined));
    renderSection();
    expect(await screen.findByText('Cargando bloqueos…')).toBeInTheDocument();
  });

  it('muestra el estado vacío con el botón Nuevo bloqueo', async () => {
    renderSection();
    expect(await screen.findByText('Sin bloqueos vigentes')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith('piscina-1');
    // Cabecera y estado vacío.
    expect(screen.getAllByRole('button', { name: 'Nuevo bloqueo' })).toHaveLength(2);
  });

  it('lista los bloqueos en una tabla con ventana en hora de Lima y motivo', async () => {
    listMock.mockResolvedValue({
      items: [block(), block({ blockId: 'blk-2', reason: null })],
    });
    renderSection();

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(rows).toHaveLength(2);
    expect(screen.getByRole('columnheader', { name: 'Inicio' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fin' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Motivo' })).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/08:00/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Limpieza de piscina')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Sin motivo indicado')).toBeInTheDocument();
  });

  it('ordena los bloqueos por inicio', async () => {
    listMock.mockResolvedValue({
      items: [
        block({ blockId: 'blk-late', startsAt: '2026-08-10T13:00:00.000Z', reason: 'Tardío' }),
        block({ blockId: 'blk-early', startsAt: '2026-07-05T13:00:00.000Z', reason: 'Temprano' }),
      ],
    });
    renderSection();

    const rows = (await screen.findAllByRole('row')).slice(1);
    expect(within(rows[0]!).getByText('Temprano')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Tardío')).toBeInTheDocument();
  });

  it('consulta los bloqueos de otra instalación y la guarda en la URL', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('Sin bloqueos vigentes');

    await user.selectOptions(screen.getByLabelText('Ver bloqueos de'), 'tenis-1');

    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('tenis-1'));
    expect(screen.getByTestId('location')).toHaveTextContent('recurso=tenis-1');
  });

  it('respeta la instalación indicada en la URL', async () => {
    renderSection('/admin/recursos?tab=mantenimiento&recurso=tenis-1');
    await waitFor(() => expect(listMock).toHaveBeenCalledWith('tenis-1'));
    expect(screen.getByLabelText('Ver bloqueos de')).toHaveValue('tenis-1');
  });

  it('abre la ventana de nuevo bloqueo con ?nuevo=1 y limpia el parámetro', async () => {
    renderSection('/admin/recursos?tab=mantenimiento&nuevo=1');

    const dialog = await screen.findByRole('dialog', { name: 'Nuevo bloqueo por mantenimiento' });
    expect(within(dialog).getByLabelText(/Instalación/)).toHaveValue('piscina-1');
    expect(screen.getByTestId('location')).not.toHaveTextContent('nuevo');
    expect(screen.getByTestId('location')).toHaveTextContent('tab=mantenimiento');
  });

  it('abre la ventana con la instalación seleccionada precargada', async () => {
    const user = userEvent.setup();
    renderSection('/admin/recursos?tab=mantenimiento&recurso=tenis-1');
    const { form } = await openNewBlock(user);

    expect(within(form).getByLabelText(/Instalación/)).toHaveValue('tenis-1');
  });

  it('crea el bloqueo enviando la hora de Lima en UTC y avisa con un toast', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      blockId: 'blk-9',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: 'Limpieza',
      affectedReservationCount: 0,
    });
    renderSection();
    const { dialog } = await fillForm(user, { reason: 'Limpieza' });

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('piscina-1', {
        // 08:00 y 13:00 de Lima.
        startsAt: '2026-07-20T13:00:00Z',
        endsAt: '2026-07-20T18:00:00Z',
        reason: 'Limpieza',
      }),
    );
    expect(await screen.findByText('Bloqueo creado')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText(/quedan dentro del bloqueo/)).not.toBeInTheDocument();
  });

  it('con reservas afectadas muestra un aviso persistente con Ver reservas', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      blockId: 'blk-9',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: null,
      affectedReservationCount: 2,
    });
    renderSection();
    const { dialog } = await fillForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    expect(await screen.findByText(/2 reservas quedan dentro del bloqueo/)).toBeInTheDocument();
    expect(screen.getByText(/No se cancelan solas\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver reservas' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/admin/reservas?recurso=piscina-1');
  });

  it('usa singular con una sola reserva afectada', async () => {
    const user = userEvent.setup();
    createMock.mockResolvedValue({
      blockId: 'blk-9',
      resourceId: 'piscina-1',
      startsAt: '2026-07-20T13:00:00Z',
      endsAt: '2026-07-20T18:00:00Z',
      reason: null,
      affectedReservationCount: 1,
    });
    renderSection();
    const { dialog } = await fillForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    expect(await screen.findByText(/1 reserva queda dentro del bloqueo/)).toBeInTheDocument();
  });

  it('omite el motivo si queda vacío', async () => {
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
    const { dialog } = await fillForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith('piscina-1', {
        startsAt: '2026-07-20T13:00:00Z',
        endsAt: '2026-07-20T18:00:00Z',
      }),
    );
  });

  it('exige instalación, fechas y horas antes de enviar', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog, form } = await openNewBlock(user);
    await user.selectOptions(within(form).getByLabelText(/Instalación/), '');

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    expect(await within(form).findByText('Elige una instalación.')).toBeInTheDocument();
    expect(within(form).getByText('Elige la fecha de inicio.')).toBeInTheDocument();
    expect(within(form).getByText('Elige la hora de fin.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza un fin anterior o igual al inicio junto al campo, sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog, form } = await fillForm(user, {
      start: ['2026-07-20', '13:00'],
      end: ['2026-07-20', '08:00'],
    });

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    expect(
      await within(form).findByText('El fin debe ser posterior al inicio.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza un inicio en el pasado sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog, form } = await fillForm(user, {
      start: ['2026-06-20', '08:00'],
      end: ['2026-06-20', '13:00'],
    });

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    expect(
      await within(form).findByText('El inicio no puede estar en el pasado.'),
    ).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });

  it('limita el motivo a 280 caracteres', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog, form } = await fillForm(user);
    const reason = within(form).getByLabelText(/Motivo/);
    await user.click(reason);
    await user.paste('a'.repeat(281));

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

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
  ] as const)(
    'traduce el error %s dentro de la ventana sin cerrarla ni perder lo escrito',
    async (code, text) => {
      const user = userEvent.setup();
      createMock.mockRejectedValue(new ApiRequestError(400, code, 'mensaje crudo'));
      renderSection();
      const { dialog, form } = await fillForm(user, { reason: 'Limpieza' });

      await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(text);
      expect(screen.queryByText(/mensaje crudo/)).not.toBeInTheDocument();
      expect(
        screen.getByRole('dialog', { name: 'Nuevo bloqueo por mantenimiento' }),
      ).toBeInTheDocument();
      expect(within(form).getByLabelText(/Motivo/)).toHaveValue('Limpieza');
      expect(within(form).getByLabelText(/Fecha de inicio/)).toHaveValue('2026-07-20');
    },
  );

  it('cierra la sesión si el token expiró al crear', async () => {
    const user = userEvent.setup();
    createMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
    renderSection();
    const { dialog } = await fillForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Crear bloqueo' }));

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
  });

  it('pide confirmación al cerrar la ventana con datos escritos', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog } = await fillForm(user, { reason: 'Limpieza' });

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    const discard = await screen.findByRole('alertdialog');
    expect(discard).toHaveTextContent('¿Descartar el bloqueo?');
    await user.click(within(discard).getByRole('button', { name: 'Descartar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createMock).not.toHaveBeenCalled();
  });

  it('cierra sin preguntar si el formulario está intacto', async () => {
    const user = userEvent.setup();
    renderSection();
    const { dialog } = await openNewBlock(user);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('libera un bloqueo con confirmación (204 sin cuerpo), avisa y refresca la lista', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce({ items: [block()] }).mockResolvedValue({ items: [] });
    releaseMock.mockResolvedValue(undefined);
    renderSection();

    await user.click(await screen.findByRole('button', { name: /Liberar bloqueo/ }));
    const dialog = screen.getByRole('alertdialog');
    // El resumen muestra instalación, inicio, fin y motivo.
    expect(dialog).toHaveTextContent('Piscina');
    expect(dialog).toHaveTextContent('08:00');
    expect(dialog).toHaveTextContent('13:00');
    expect(dialog).toHaveTextContent('Limpieza de piscina');
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
