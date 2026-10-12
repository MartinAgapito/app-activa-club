// Recursos y mantenimiento (US-036 criterios 5 y 12, reorganizado en US-075):
// pestañas con la activa en la URL, tabla de instalaciones, edición en una
// ventana con confirmación antes → después, textos de reservas existentes y
// errores del contrato dentro de la ventana.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
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

// La pestaña de mantenimiento tiene sus propias pruebas
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

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{`${location.pathname}${location.search}`}</p>;
}

function renderPage(initialEntry = '/admin/recursos') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <ResourcesMaintenancePage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name).closest('tr')!;
}

async function openEditor(user: ReturnType<typeof userEvent.setup>, name = 'Cancha de fútbol 1') {
  await user.click(await screen.findByRole('button', { name: `Editar ${name}` }));
  const dialog = await screen.findByRole('dialog', { name: `Editar ${name}` });
  return { dialog, form: within(dialog).getByRole('form', { name: `Editar ${name}` }) };
}

async function changeCapacity(
  form: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
  to: string,
) {
  const capacity = within(form).getByLabelText(/Aforo/);
  await user.clear(capacity);
  await user.type(capacity, to);
}

describe('ResourcesMaintenancePage - pestañas', () => {
  beforeEach(() => {
    fetchResourcesMock.mockResolvedValue([FUTBOL, PARRILLA]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('abre en Instalaciones por defecto y expone las dos pestañas', async () => {
    renderPage();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Instalaciones', 'Mantenimiento']);
    expect(screen.getByRole('tab', { name: 'Instalaciones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
  });

  it('guarda la pestaña activa en la URL al cambiar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'Mantenimiento' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/admin/recursos?tab=mantenimiento');
    expect(await screen.findByText('Bloqueos por mantenimiento')).toBeInTheDocument();
  });

  it('respeta ?tab=mantenimiento al abrir la página', async () => {
    renderPage('/admin/recursos?tab=mantenimiento');
    expect(screen.getByRole('tab', { name: 'Mantenimiento' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByRole('button', { name: 'Nuevo bloqueo' })).toBeInTheDocument();
  });

  it('ignora una pestaña desconocida y muestra Instalaciones', async () => {
    renderPage('/admin/recursos?tab=otra');
    expect(screen.getByRole('tab', { name: 'Instalaciones' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
  });
});

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

  it('muestra la tabla con aforo, horario, estado y datos de solo lectura', async () => {
    renderPage();

    await screen.findByText('Cancha de fútbol 1');
    for (const header of [
      'Instalación',
      'Tipo',
      'Aforo',
      'Horario',
      'Duración del bloque',
      'Requiere aprobación',
      'Estado',
    ]) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }

    const futbol = rowOf('Cancha de fútbol 1');
    expect(within(futbol).getByText('Fútbol')).toBeInTheDocument();
    expect(within(futbol).getByText('14 personas')).toBeInTheDocument();
    expect(within(futbol).getByText('06:00 – 22:00')).toBeInTheDocument();
    expect(within(futbol).getByText('Disponible')).toBeInTheDocument();
    expect(within(futbol).getByText('90 min')).toBeInTheDocument();
    expect(within(futbol).getByText('No')).toBeInTheDocument();
    expect(within(futbol).getByRole('button', { name: 'Editar Cancha de fútbol 1' })).toBeVisible();

    const parrilla = rowOf('Parrilla 1');
    expect(within(parrilla).getByText('En mantenimiento')).toBeInTheDocument();
    expect(within(parrilla).getByText('Sí')).toBeInTheDocument();
  });

  it('no ofrece alta ni baja de instalaciones', async () => {
    renderPage();
    await screen.findByText('Cancha de fútbol 1');
    expect(
      screen.queryByRole('button', { name: /nueva instalación|agregar|eliminar/i }),
    ).toBeNull();
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
    expect(await screen.findByText('Cancha de fútbol 1')).toBeInTheDocument();
  });

  it('abre la ventana con los valores actuales y los datos fijos como solo lectura', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    expect(within(form).getByLabelText(/Aforo/)).toHaveValue(14);
    expect(within(form).getByLabelText(/Hora de apertura/)).toHaveValue('06:00');
    expect(within(form).getByLabelText(/Hora de cierre/)).toHaveValue('22:00');
    expect(within(form).getByLabelText('Estado')).toHaveValue('AVAILABLE');

    // Solo lectura: se muestran en la ventana pero no son campos editables.
    expect(within(dialog).getByText('Duración del bloque')).toBeInTheDocument();
    expect(within(dialog).getByText('90 min')).toBeInTheDocument();
    expect(within(dialog).getByText('Requiere aprobación')).toBeInTheDocument();
    expect(within(dialog).getByText(/se cambian por despliegue/)).toBeInTheDocument();
    expect(within(form).queryByLabelText(/Nombre/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/Tipo/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/bloque/i)).not.toBeInTheDocument();
    expect(within(form).queryByLabelText(/aprobación/i)).not.toBeInTheDocument();
  });

  it('deshabilita Guardar mientras no haya cambios', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    const save = within(dialog).getByRole('button', { name: 'Guardar' });
    expect(save).toBeDisabled();

    await changeCapacity(form, user, '12');
    expect(save).toBeEnabled();

    await changeCapacity(form, user, '14');
    expect(save).toBeDisabled();
    expect(updateResourceMock).not.toHaveBeenCalled();
  });

  it('valida aforo positivo y cierre posterior a apertura junto al campo sin llamar al servidor', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    await changeCapacity(form, user, '0');
    const closes = within(form).getByLabelText(/Hora de cierre/);
    await user.clear(closes);
    await user.type(closes, '05:00');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(form).findByText('El aforo debe ser mayor que cero.')).toBeInTheDocument();
    expect(
      within(form).getByText('La hora de cierre debe ser posterior a la de apertura.'),
    ).toBeInTheDocument();
    expect(updateResourceMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('valida un aforo decimal en línea', async () => {
    const user = userEvent.setup();
    renderPage();
    const { form } = await openEditor(user);

    await changeCapacity(form, user, '2.5');

    expect(
      await within(form).findByText('El aforo debe ser un número entero.'),
    ).toBeInTheDocument();
  });

  it('confirma con el antes → después, guarda solo los campos cambiados y avisa con un toast', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockResolvedValue({ ...FUTBOL, capacity: 10 });
    renderPage();
    const { dialog, form } = await openEditor(user);

    await changeCapacity(form, user, '10');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('14 personas → 10 personas');
    expect(confirm).toHaveTextContent('no se invalidan');
    expect(updateResourceMock).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateResourceMock).toHaveBeenCalledWith('futbol-1', { capacity: 10 }),
    );
    expect(await screen.findByText('Instalación actualizada')).toBeInTheDocument();
    // La ventana se cierra y la fila refleja el cambio sin recargar.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(rowOf('Cancha de fútbol 1')).getByText('10 personas')).toBeInTheDocument();
  });

  it('muestra el horario cambiado en el resumen de confirmación', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    const opens = within(form).getByLabelText(/Hora de apertura/);
    await user.clear(opens);
    await user.type(opens, '07:00');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('Apertura: 06:00 → 07:00');
    expect(confirm).toHaveTextContent('no se invalidan');
  });

  it('explica que poner en mantenimiento es un bloqueo indefinido', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockResolvedValue({ ...FUTBOL, resourceStatus: 'MAINTENANCE' });
    renderPage();
    const { dialog, form } = await openEditor(user);

    await user.selectOptions(within(form).getByLabelText('Estado'), 'MAINTENANCE');
    expect(within(form).getByText(/bloqueo/, { selector: 'p' })).toHaveTextContent('indefinido');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(confirm).toHaveTextContent('bloqueo indefinido');
    expect(confirm).toHaveTextContent('Las reservas existentes siguen vigentes');
    await user.click(within(confirm).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(updateResourceMock).toHaveBeenCalledWith('futbol-1', {
        resourceStatus: 'MAINTENANCE',
      }),
    );
  });

  it('vuelve a Disponible sin pedir confirmación', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockResolvedValue({ ...PARRILLA, resourceStatus: 'AVAILABLE' });
    renderPage();
    const { dialog, form } = await openEditor(user, 'Parrilla 1');

    await user.selectOptions(within(form).getByLabelText('Estado'), 'AVAILABLE');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(updateResourceMock).toHaveBeenCalledWith('parrilla-1', {
        resourceStatus: 'AVAILABLE',
      }),
    );
    expect(await screen.findByText('Instalación actualizada')).toBeInTheDocument();
  });

  it('permite cancelar la confirmación sin guardar y conserva lo escrito', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    await changeCapacity(form, user, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }),
    );

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(updateResourceMock).not.toHaveBeenCalled();
    expect(within(form).getByLabelText(/Aforo/)).toHaveValue(12);
  });

  it('cierra sin preguntar si no hay cambios', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog } = await openEditor(user);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('pide confirmación al cerrar con cambios sin guardar', async () => {
    const user = userEvent.setup();
    renderPage();
    const { dialog, form } = await openEditor(user);

    await changeCapacity(form, user, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    const discard = await screen.findByRole('alertdialog');
    expect(discard).toHaveTextContent('¿Descartar los cambios?');
    await user.click(within(discard).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.getByRole('dialog', { name: 'Editar Cancha de fútbol 1' })).toBeInTheDocument();
    expect(within(form).getByLabelText(/Aforo/)).toHaveValue(12);

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Descartar cambios',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updateResourceMock).not.toHaveBeenCalled();
    expect(within(rowOf('Cancha de fútbol 1')).getByText('14 personas')).toBeInTheDocument();
  });

  it.each([
    ['VALIDATION_ERROR', 'El servidor no aceptó los cambios'],
    ['NOT_FOUND', 'No encontramos la instalación'],
    ['FORBIDDEN', 'No tienes permiso para esta acción'],
    ['NETWORK_ERROR', 'No pudimos conectar con el servidor'],
    ['INTERNAL_ERROR', 'No pudimos guardar los cambios'],
  ] as const)(
    'traduce el error %s dentro de la ventana, sin cerrarla ni perder lo escrito',
    async (code, text) => {
      const user = userEvent.setup();
      updateResourceMock.mockRejectedValue(new ApiRequestError(400, code, 'mensaje crudo'));
      renderPage();
      const { dialog, form } = await openEditor(user);

      await changeCapacity(form, user, '12');
      await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
      await user.click(
        within(await screen.findByRole('alertdialog')).getByRole('button', {
          name: 'Guardar cambios',
        }),
      );

      const alert = await within(dialog).findByRole('alert');
      expect(alert).toHaveTextContent(text);
      expect(alert).not.toHaveTextContent('mensaje crudo');
      expect(screen.getByRole('dialog', { name: 'Editar Cancha de fútbol 1' })).toBeInTheDocument();
      expect(within(form).getByLabelText(/Aforo/)).toHaveValue(12);
      expect(screen.queryByText('Instalación actualizada')).not.toBeInTheDocument();
    },
  );

  it('cierra la sesión si el token expiró al guardar', async () => {
    const user = userEvent.setup();
    updateResourceMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
    renderPage();
    const { dialog, form } = await openEditor(user);

    await changeCapacity(form, user, '12');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Guardar cambios',
      }),
    );

    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Tu sesión expiró')).toBeInTheDocument();
  });
});
