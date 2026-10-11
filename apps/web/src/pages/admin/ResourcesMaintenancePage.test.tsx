// Recursos y mantenimiento (US-036 criterios 5 y 12): catálogo, edición de
// aforo/horario/estado con confirmación, textos de reservas existentes y
// errores del contrato.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Resource } from '@activa-club/shared-types';
import { ResourcesMaintenancePage } from './ResourcesMaintenancePage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchResourcesMock, updateResourceMock, signOutMock } = vi.hoisted(() => ({
  fetchResourcesMock: vi.fn(),
  updateResourceMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

vi.mock('../../admin/resources/admin-resources-client', () => ({
  updateResource: updateResourceMock,
}));

// La sección de mantenimiento tiene sus propias pruebas
// (`admin/maintenance/MaintenanceSection.test.tsx`); aquí solo se compone.
vi.mock('../../admin/maintenance/admin-maintenance-client', () => ({
  createMaintenanceBlock: vi.fn(),
  listMaintenanceBlocks: () => Promise.resolve({ items: [] }),
  releaseMaintenanceBlock: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

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

const PARRILLA: Resource = {
  resourceId: 'parrilla-1',
  type: 'PARRILLA',
  name: 'Parrilla 1',
  capacity: 20,
  blockMinutes: 300,
  opensAt: '08:00',
  closesAt: '23:00',
  requiresApproval: true,
  resourceStatus: 'MAINTENANCE',
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResourcesMaintenancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name = 'Cancha de fútbol 1') {
  await user.click(await screen.findByRole('button', { name: `Editar ${name}` }));
  return screen.getByRole('form', { name: `Editar ${name}` });
}

describe('ResourcesMaintenancePage - gestión de recursos', () => {
  beforeEach(() => {
    fetchResourcesMock.mockResolvedValue([FUTBOL, PARRILLA]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el estado de carga', () => {
    fetchResourcesMock.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByText('Cargando instalaciones…')).toBeInTheDocument();
  });

  it('muestra el catálogo con aforo, horario, estado y datos de solo lectura', async () => {
    renderPage();

    const futbol = (await screen.findByRole('heading', { name: 'Cancha de fútbol 1' })).closest(
      'li',
    )!;
    expect(within(futbol).getByText('14 personas')).toBeInTheDocument();
    expect(within(futbol).getByText('06:00 – 22:00')).toBeInTheDocument();
    expect(within(futbol).getByText('Disponible')).toBeInTheDocument();
    expect(within(futbol).getByText('90 min')).toBeInTheDocument();
    expect(within(futbol).getByText('No')).toBeInTheDocument();
    expect(within(futbol).getByText(/no se editan aquí/)).toBeInTheDocument();

    const parrilla = screen.getByRole('heading', { name: 'Parrilla 1' }).closest('li')!;
    expect(within(parrilla).getByText('En mantenimiento')).toBeInTheDocument();
    expect(within(parrilla).getByText('Sí')).toBeInTheDocument();
  });

  it('explica que bajar el aforo o cambiar el horario no invalida reservas', async () => {
    renderPage();
    expect(await screen.findByText(/no invalida las reservas ya creadas/)).toBeInTheDocument();
  });

  it('muestra el estado vacío', async () => {
    fetchResourcesMock.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText('No hay instalaciones en el catálogo')).toBeInTheDocument();
  });

  it('muestra el error de carga y permite reintentar', async () => {
    const user = userEvent.setup();
    fetchResourcesMock
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'detalle interno'))
      .mockResolvedValue([FUTBOL]);
    renderPage();

    expect(await screen.findByText('No pudimos cargar las instalaciones')).toBeInTheDocument();
    expect(screen.queryByText(/detalle interno/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Cancha de fútbol 1' })).toBeInTheDocument();
  });

  it('el formulario no permite editar nombre, tipo ni bloque', async () => {
    const user = userEvent.setup();
    renderPage();
    const form = await openEditor(user);

    expect(within(form).getByLabelText(/Aforo/)).toBeInTheDocument();
    expect(within(form).getByLabelText(/Hora de apertura/)).toBeInTheDocument();
    expect(within(form).getByLabelText(/Hora de cierre/)).toBeInTheDocument();
    expect(within(form).getByLabelText('Estado')).toBeInTheDocument();
    expect(within(form).queryByLabelText(/Nombre/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/bloque/i)).not.toBeInTheDocument();
  });

  it('valida aforo positivo y cierre posterior a apertura sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    const form = await openEditor(user);

    const capacity = within(form).getByLabelText(/Aforo/);
    await user.clear(capacity);
    await user.type(capacity, '0');
    const closes = within(form).getByLabelText(/Hora de cierre/);
    await user.clear(closes);
    await user.type(closes, '05:00');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));

    expect(await within(form).findByText('El aforo debe ser mayor que cero.')).toBeInTheDocument();
    expect(
      within(form).getByText('La hora de cierre debe ser posterior a la de apertura.'),
    ).toBeInTheDocument();
    expect(updateResourceMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('avisa si no hay cambios', async () => {
    const user = userEvent.setup();
    renderPage();
    const form = await openEditor(user);

    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));

    expect(await within(form).findByText('No hay cambios para guardar.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('confirma y guarda solo los campos cambiados', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockResolvedValue({ ...FUTBOL, capacity: 10 });
    renderPage();
    const form = await openEditor(user);

    const capacity = within(form).getByLabelText(/Aforo/);
    await user.clear(capacity);
    await user.type(capacity, '10');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('14 personas → 10 personas');
    expect(dialog).toHaveTextContent('no se invalidan');
    expect(updateResourceMock).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateResourceMock).toHaveBeenCalledWith('futbol-1', { capacity: 10 }),
    );
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Cancha de fútbol 1' }).closest('li')!;
    expect(within(card).getByText('10 personas')).toBeInTheDocument();
  });

  it('explica que poner en mantenimiento es un bloqueo indefinido', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockResolvedValue({ ...FUTBOL, resourceStatus: 'MAINTENANCE' });
    renderPage();
    const form = await openEditor(user);

    await user.selectOptions(within(form).getByLabelText('Estado'), 'MAINTENANCE');
    expect(within(form).getByText(/bloqueo/, { selector: 'p' })).toHaveTextContent('indefinido');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('bloqueo indefinido');
    expect(dialog).toHaveTextContent('Las reservas existentes siguen vigentes');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateResourceMock).toHaveBeenCalledWith('futbol-1', {
        resourceStatus: 'MAINTENANCE',
      }),
    );
  });

  it('permite cancelar la confirmación sin guardar', async () => {
    const user = userEvent.setup();
    renderPage();
    const form = await openEditor(user);

    const capacity = within(form).getByLabelText(/Aforo/);
    await user.clear(capacity);
    await user.type(capacity, '12');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(updateResourceMock).not.toHaveBeenCalled();
  });

  it.each([
    ['VALIDATION_ERROR', 'El servidor no aceptó los cambios'],
    ['NOT_FOUND', 'No encontramos la instalación'],
    ['FORBIDDEN', 'No tienes permiso para esta acción'],
    ['NETWORK_ERROR', 'No pudimos conectar con el servidor'],
    ['INTERNAL_ERROR', 'No pudimos guardar los cambios'],
  ] as const)('traduce el error %s al guardar sin mensaje crudo', async (code, text) => {
    const user = userEvent.setup();
    updateResourceMock.mockRejectedValue(new ApiRequestError(400, code, 'mensaje crudo'));
    renderPage();
    const form = await openEditor(user);

    const capacity = within(form).getByLabelText(/Aforo/);
    await user.clear(capacity);
    await user.type(capacity, '12');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Guardar cambios',
      }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    expect(alert).not.toHaveTextContent('mensaje crudo');
  });

  it('cierra la sesión si el token expiró al guardar', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
    renderPage();
    const form = await openEditor(user);

    const capacity = within(form).getByLabelText(/Aforo/);
    await user.clear(capacity);
    await user.type(capacity, '12');
    await user.click(within(form).getByRole('button', { name: 'Revisar cambios' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Guardar cambios',
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
  });
});
