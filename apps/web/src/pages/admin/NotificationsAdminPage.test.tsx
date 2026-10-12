// Consola de notificaciones (US-049): publicar con confirmación, resumen del
// resultado, errores del contrato sin perder lo escrito, historial con
// "Cargar más" y panel de detalle.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  CreateNotificationResponse,
  Resource,
  SentNotification,
} from '@activa-club/shared-types';
import { NotificationsAdminPage } from './NotificationsAdminPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { publishMock, listSentMock, lookupMock, fetchResourcesMock, signOutMock } = vi.hoisted(
  () => ({
    publishMock: vi.fn(),
    listSentMock: vi.fn(),
    lookupMock: vi.fn(),
    fetchResourcesMock: vi.fn(),
    signOutMock: vi.fn(),
  }),
);

vi.mock('../../notifications/admin-notifications-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../notifications/admin-notifications-client')>()),
  publishNotification: publishMock,
  listSentNotifications: listSentMock,
}));

vi.mock('../../reservations/reservations-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../reservations/reservations-client')>()),
  lookupMemberByDni: lookupMock,
}));

vi.mock('../../resources/resources-client', () => ({
  fetchResources: fetchResourcesMock,
  fetchResourceAvailability: vi.fn(),
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

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

function sent(overrides: Partial<SentNotification> = {}): SentNotification {
  return {
    notificationId: 'n-1',
    title: 'Regulariza tu membresía',
    body: 'Tienes un saldo pendiente.\nPaga desde la sección Membresía.',
    segment: 'DEBT',
    targetMemberId: null,
    resourceId: null,
    event: null,
    alsoEmail: true,
    createdBy: 'admin-1',
    recipientCount: 34,
    // 15:30Z = 10:30 en Lima.
    createdAt: '2026-07-10T15:30:00Z',
    origin: 'MANUAL',
    ...overrides,
  };
}

function published(
  overrides: Partial<CreateNotificationResponse> = {},
): CreateNotificationResponse {
  return {
    notificationId: 'n-new',
    recipientCount: 34,
    emailsSent: 0,
    emailsFailed: 0,
    emailsSkipped: 0,
    replayed: false,
    ...overrides,
  };
}

function apiError(code: ApiRequestError['code'], status = 422) {
  return new ApiRequestError(status, code, 'mensaje del servidor');
}

function LocationDisplay() {
  const location = useLocation();
  return <p data-testid="location">{location.search}</p>;
}

function renderPage(initialEntry = '/admin/notificaciones') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <NotificationsAdminPage />
          <LocationDisplay />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

type User = ReturnType<typeof userEvent.setup>;

async function fillForm(user: User, title = 'Cierre por lluvia', body = 'La piscina cierra hoy.') {
  await user.type(screen.getByLabelText(/^Título/), title);
  await user.type(screen.getByLabelText(/^Mensaje/), body);
}

async function review(user: User) {
  await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
  return screen.findByRole('alertdialog');
}

async function confirm(user: User) {
  await user.click(screen.getByRole('button', { name: 'Publicar ahora' }));
}

function bodyRows() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1);
}

describe('NotificationsAdminPage', () => {
  beforeEach(() => {
    fetchResourcesMock.mockResolvedValue([PARRILLA]);
    listSentMock.mockResolvedValue({ items: [], nextCursor: null });
    publishMock.mockResolvedValue(published());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('estructura', () => {
    it('muestra la pantalla real, sin el texto de "en construcción"', () => {
      renderPage();
      expect(screen.getByRole('heading', { name: 'Notificaciones' })).toBeInTheDocument();
      expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Publicar' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('form', { name: 'Publicar una notificación' })).toBeInTheDocument();
    });

    it('guarda la pestaña en la URL y abre "Enviadas" con ?tab=enviadas', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('tab', { name: 'Enviadas' }));
      expect(screen.getByTestId('location')).toHaveTextContent('tab=enviadas');
      expect(await screen.findByText('Aún no se ha enviado ninguna notificación')).toBeVisible();
    });

    it('abre directamente "Enviadas" con la dirección ?tab=enviadas', async () => {
      listSentMock.mockResolvedValue({ items: [sent()], nextCursor: null });
      renderPage('/admin/notificaciones?tab=enviadas');
      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Enviadas' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('cambiar de pestaña no pierde lo escrito', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      await user.click(screen.getByRole('tab', { name: 'Enviadas' }));
      await user.click(screen.getByRole('tab', { name: 'Publicar' }));
      expect(screen.getByLabelText(/^Título/)).toHaveValue('Cierre por lluvia');
    });
  });

  describe('publicar', () => {
    it('valida los campos obligatorios y no abre la confirmación', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
      expect(await screen.findByText('Escribe un título.')).toBeInTheDocument();
      expect(screen.getByText('Escribe el mensaje.')).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(publishMock).not.toHaveBeenCalled();
    });

    it('muestra el contador de caracteres con el límite del esquema y avisa al excederlo', async () => {
      const user = userEvent.setup();
      renderPage();
      expect(screen.getByText('0 de 120 caracteres')).toBeInTheDocument();
      expect(screen.getByText('0 de 2000 caracteres')).toBeInTheDocument();
      await user.type(screen.getByLabelText(/^Título/), 'Hola');
      expect(screen.getByText('4 de 120 caracteres')).toBeInTheDocument();

      await user.clear(screen.getByLabelText(/^Título/));
      await user.click(screen.getByLabelText(/^Título/));
      await user.paste('a'.repeat(121));
      await user.type(screen.getByLabelText(/^Mensaje/), 'Cuerpo');
      await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
      expect(await screen.findByText('El título admite hasta 120 caracteres.')).toBeInTheDocument();
      expect(publishMock).not.toHaveBeenCalled();
    });

    it('confirma con un resumen, publica y muestra el resultado en pantalla', async () => {
      const user = userEvent.setup();
      publishMock.mockResolvedValue(published({ recipientCount: 34 }));
      renderPage();
      await fillForm(user);

      const dialog = await review(user);
      expect(within(dialog).getByText('Cierre por lluvia')).toBeInTheDocument();
      expect(within(dialog).getByText('La piscina cierra hoy.')).toBeInTheDocument();
      expect(within(dialog).getByText('Todos los socios')).toBeInTheDocument();
      expect(within(dialog).getByText('No, solo en la bandeja del socio')).toBeInTheDocument();
      expect(within(dialog).getByText(/no se puede deshacer/i)).toBeInTheDocument();
      expect(publishMock).not.toHaveBeenCalled();

      await confirm(user);

      await waitFor(() =>
        expect(publishMock).toHaveBeenCalledWith({
          segment: 'ALL',
          title: 'Cierre por lluvia',
          body: 'La piscina cierra hoy.',
          alsoEmail: false,
        }),
      );
      const result = await screen.findByRole('region', { name: 'Notificación publicada' });
      expect(within(result).getByText('Socios que lo recibieron')).toBeInTheDocument();
      expect(within(result).getByText('34')).toBeInTheDocument();
      // Toast y encabezado del resumen.
      expect(screen.getAllByText('Notificación publicada')).toHaveLength(2);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      // El formulario queda limpio.
      expect(screen.getByLabelText(/^Título/)).toHaveValue('');
    });

    it('refresca el historial tras publicar', async () => {
      const user = userEvent.setup();
      listSentMock.mockResolvedValue({ items: [], nextCursor: null });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByText('Aún no se ha enviado ninguna notificación');
      listSentMock.mockResolvedValue({
        items: [sent({ title: 'Cierre por lluvia' })],
        nextCursor: null,
      });
      await user.click(screen.getByRole('tab', { name: 'Publicar' }));
      await fillForm(user);
      await review(user);
      await confirm(user);
      await screen.findByRole('region', { name: 'Notificación publicada' });
      await user.click(screen.getByRole('button', { name: 'Ver en Enviadas' }));
      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Cierre por lluvia')).toBeInTheDocument();
    });

    it('con correo: avisa del tope de 15 y de SES, lo confirma y muestra los contadores', async () => {
      const user = userEvent.setup();
      publishMock.mockResolvedValue(
        published({ recipientCount: 34, emailsSent: 15, emailsFailed: 1, emailsSkipped: 18 }),
      );
      renderPage();
      expect(screen.getByText(/como máximo 15 correos/)).toBeInTheDocument();
      expect(screen.getByText(/direcciones verificadas en SES/)).toBeInTheDocument();
      await fillForm(user);
      await user.click(screen.getByLabelText('Enviar también por correo'));

      const dialog = await review(user);
      expect(within(dialog).getByText(/Sí, también por correo/)).toBeInTheDocument();
      await confirm(user);

      await waitFor(() =>
        expect(publishMock).toHaveBeenCalledWith(expect.objectContaining({ alsoEmail: true })),
      );
      const result = await screen.findByRole('region', { name: 'Notificación publicada' });
      const stats = within(result);
      expect(stats.getByText('Correos enviados').nextSibling).toHaveTextContent('15');
      expect(stats.getByText('Correos fallidos').nextSibling).toHaveTextContent('1');
      expect(stats.getByText('Correos omitidos').nextSibling).toHaveTextContent('18');
    });

    it('indica cuando fue una repetición (replayed)', async () => {
      const user = userEvent.setup();
      publishMock.mockResolvedValue(published({ replayed: true }));
      renderPage();
      await fillForm(user);
      await review(user);
      await confirm(user);
      const result = await screen.findByRole('region', { name: 'Notificación publicada' });
      expect(within(result).getByText('Repetición')).toBeInTheDocument();
      expect(within(result).getByText(/No se duplicó/)).toBeInTheDocument();
    });

    it('evita la doble publicación con doble clic: botón deshabilitado en vuelo', async () => {
      const user = userEvent.setup();
      let resolve: (value: CreateNotificationResponse) => void = () => undefined;
      publishMock.mockReturnValue(
        new Promise<CreateNotificationResponse>((r) => {
          resolve = r;
        }),
      );
      renderPage();
      await fillForm(user);
      await review(user);

      const button = screen.getByRole('button', { name: 'Publicar ahora' });
      await user.dblClick(button);

      expect(publishMock).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(button).toBeDisabled());

      resolve(published());
      await screen.findByRole('region', { name: 'Notificación publicada' });
      expect(publishMock).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra la confirmación, devuelve el foco y conserva lo escrito', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      await review(user);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(screen.getByRole('button', { name: 'Revisar y publicar' })).toHaveFocus();
      expect(screen.getByLabelText(/^Título/)).toHaveValue('Cierre por lluvia');
      expect(publishMock).not.toHaveBeenCalled();
    });

    it('Escape no cierra la confirmación mientras se publica', async () => {
      const user = userEvent.setup();
      publishMock.mockReturnValue(new Promise(() => undefined));
      renderPage();
      await fillForm(user);
      await review(user);
      await confirm(user);
      await user.keyboard('{Escape}');
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    });

    it('"Volver a editar" cierra la confirmación sin publicar', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      await review(user);
      await user.click(screen.getByRole('button', { name: 'Volver a editar' }));
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(publishMock).not.toHaveBeenCalled();
    });
  });

  describe('destinatarios', () => {
    it('SINGLE: busca por DNI, muestra el nombre y publica con targetMemberId', async () => {
      const user = userEvent.setup();
      lookupMock.mockResolvedValue({ memberId: 'm-9', firstName: 'Ana', lastName: 'Torres' });
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');

      await user.type(screen.getByLabelText(/DNI del socio/), '12345678');
      await user.click(screen.getByRole('button', { name: 'Buscar socio' }));
      expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
      expect(lookupMock).toHaveBeenCalledWith('12345678');

      const dialog = await review(user);
      expect(within(dialog).getByText('Un socio: Ana Torres')).toBeInTheDocument();
      await confirm(user);
      await waitFor(() =>
        expect(publishMock).toHaveBeenCalledWith({
          segment: 'SINGLE',
          title: 'Cierre por lluvia',
          body: 'La piscina cierra hoy.',
          alsoEmail: false,
          targetMemberId: 'm-9',
        }),
      );
    });

    it('SINGLE: Enter en el DNI busca sin enviar el formulario', async () => {
      const user = userEvent.setup();
      lookupMock.mockResolvedValue({ memberId: 'm-9', firstName: 'Ana', lastName: 'Torres' });
      renderPage();
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.type(screen.getByLabelText(/DNI del socio/), '12345678{Enter}');
      expect(await screen.findByText('Ana Torres')).toBeInTheDocument();
      expect(screen.queryByText('Escribe un título.')).not.toBeInTheDocument();
    });

    it('SINGLE: DNI inexistente informa que no se encontró y no publica', async () => {
      const user = userEvent.setup();
      lookupMock.mockRejectedValue(apiError('DNI_NOT_FOUND', 404));
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.type(screen.getByLabelText(/DNI del socio/), '12345678');
      await user.click(screen.getByRole('button', { name: 'Buscar socio' }));
      expect(await screen.findByText('No encontramos un socio con ese DNI.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(screen.getByText('No encontramos un socio con ese DNI.')).toBeInTheDocument();
      expect(publishMock).not.toHaveBeenCalled();
    });

    it('SINGLE: exige buscar y confirmar al socio antes de publicar', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
      expect(
        await screen.findByText('Busca al socio por su DNI y confirma su nombre.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(publishMock).not.toHaveBeenCalled();
    });

    it('SINGLE: un DNI mal formado no consulta al servidor', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.type(screen.getByLabelText(/DNI del socio/), '123');
      await user.click(screen.getByRole('button', { name: 'Buscar socio' }));
      expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it('SINGLE: "Cambiar socio" permite buscar a otro', async () => {
      const user = userEvent.setup();
      lookupMock.mockResolvedValue({ memberId: 'm-9', firstName: 'Ana', lastName: 'Torres' });
      renderPage();
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.type(screen.getByLabelText(/DNI del socio/), '12345678');
      await user.click(screen.getByRole('button', { name: 'Buscar socio' }));
      await user.click(await screen.findByRole('button', { name: 'Cambiar socio' }));
      expect(screen.getByLabelText(/DNI del socio/)).toHaveValue('');
    });

    it('BY_RESOURCE: elige la instalación de una lista y publica con resourceId', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'BY_RESOURCE');

      await user.click(screen.getByRole('button', { name: 'Revisar y publicar' }));
      expect(await screen.findByText('Elige la instalación.')).toBeInTheDocument();

      await screen.findByRole('option', { name: 'Parrilla 1' });
      await user.selectOptions(screen.getByLabelText(/^Instalación/), 'parrilla-1');
      const dialog = await review(user);
      expect(within(dialog).getByText('Titulares de reservas de Parrilla 1')).toBeInTheDocument();
      await confirm(user);
      await waitFor(() =>
        expect(publishMock).toHaveBeenCalledWith(
          expect.objectContaining({ segment: 'BY_RESOURCE', resourceId: 'parrilla-1' }),
        ),
      );
    });

    it('BY_RESOURCE: si falla la lista de instalaciones permite reintentar', async () => {
      const user = userEvent.setup();
      fetchResourcesMock.mockRejectedValueOnce(apiError('NETWORK_ERROR', 0));
      renderPage();
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'BY_RESOURCE');
      expect(await screen.findByText(/No pudimos cargar las instalaciones/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('option', { name: 'Parrilla 1' })).toBeInTheDocument();
    });

    it('cambiar de segmento descarta el destino anterior', async () => {
      const user = userEvent.setup();
      renderPage();
      await fillForm(user);
      const select = screen.getByLabelText('¿A quiénes va dirigido?');
      await user.selectOptions(select, 'BY_RESOURCE');
      await screen.findByRole('option', { name: 'Parrilla 1' });
      await user.selectOptions(screen.getByLabelText(/^Instalación/), 'parrilla-1');
      await user.selectOptions(select, 'DEBT');
      await review(user);
      await confirm(user);
      await waitFor(() =>
        expect(publishMock).toHaveBeenCalledWith({
          segment: 'DEBT',
          title: 'Cierre por lluvia',
          body: 'La piscina cierra hoy.',
          alsoEmail: false,
        }),
      );
    });
  });

  describe('errores al publicar', () => {
    it.each([
      ['NO_RECIPIENTS', 422, 'Ese segmento no tiene destinatarios'],
      ['RECIPIENT_LIMIT_EXCEEDED', 422, 'El segmento supera el máximo de 500 destinatarios'],
      ['VALIDATION_ERROR', 400, 'El servidor no aceptó el aviso'],
      ['FORBIDDEN', 403, 'No tienes permiso para publicar'],
    ] as const)(
      '%s se muestra en el formulario sin perder lo escrito',
      async (code, status, text) => {
        const user = userEvent.setup();
        publishMock.mockRejectedValue(apiError(code, status));
        renderPage();
        await fillForm(user);
        await review(user);
        await confirm(user);

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(text);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Título/)).toHaveValue('Cierre por lluvia');
        expect(screen.getByLabelText(/^Mensaje/)).toHaveValue('La piscina cierra hoy.');
        expect(screen.queryByRole('region', { name: 'Notificación publicada' })).toBeNull();
      },
    );

    it('NOT_FOUND con SINGLE explica que el socio no existe o no tiene cuenta digital', async () => {
      const user = userEvent.setup();
      lookupMock.mockResolvedValue({ memberId: 'm-9', firstName: 'Ana', lastName: 'Torres' });
      publishMock.mockRejectedValue(apiError('NOT_FOUND', 404));
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'SINGLE');
      await user.type(screen.getByLabelText(/DNI del socio/), '12345678');
      await user.click(screen.getByRole('button', { name: 'Buscar socio' }));
      await screen.findByText('Ana Torres');
      await review(user);
      await confirm(user);
      expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos al socio');
      expect(screen.getByText('Ana Torres')).toBeInTheDocument();
    });

    it('NOT_FOUND con BY_RESOURCE explica que la instalación ya no existe', async () => {
      const user = userEvent.setup();
      publishMock.mockRejectedValue(apiError('NOT_FOUND', 404));
      renderPage();
      await fillForm(user);
      await user.selectOptions(screen.getByLabelText('¿A quiénes va dirigido?'), 'BY_RESOURCE');
      await screen.findByRole('option', { name: 'Parrilla 1' });
      await user.selectOptions(screen.getByLabelText(/^Instalación/), 'parrilla-1');
      await review(user);
      await confirm(user);
      expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos la instalación');
    });

    it('un error de red mantiene la ventana abierta para reintentar y aclara que pudo publicarse', async () => {
      const user = userEvent.setup();
      publishMock.mockRejectedValueOnce(apiError('NETWORK_ERROR', 0));
      renderPage();
      await fillForm(user);
      const dialog = await review(user);
      await confirm(user);

      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'No pudimos conectar con el servidor',
      );
      expect(within(dialog).getByRole('alert')).toHaveTextContent('podría haberse publicado');
      expect(screen.getByRole('button', { name: 'Publicar ahora' })).toBeEnabled();

      await confirm(user);
      await screen.findByRole('region', { name: 'Notificación publicada' });
      expect(publishMock).toHaveBeenCalledTimes(2);
    });

    it('sesión expirada cierra la sesión', async () => {
      const user = userEvent.setup();
      publishMock.mockRejectedValue(apiError('UNAUTHENTICATED', 401));
      renderPage();
      await fillForm(user);
      await review(user);
      await confirm(user);
      expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión expiró');
      expect(signOutMock).toHaveBeenCalled();
    });
  });

  describe('enviadas', () => {
    it('muestra el estado de carga', () => {
      listSentMock.mockReturnValue(new Promise(() => undefined));
      renderPage('/admin/notificaciones?tab=enviadas');
      expect(screen.getByText('Cargando notificaciones enviadas…')).toBeInTheDocument();
    });

    it('muestra el estado vacío', async () => {
      renderPage('/admin/notificaciones?tab=enviadas');
      expect(await screen.findByText('Aún no se ha enviado ninguna notificación')).toBeVisible();
    });

    it('muestra el error y permite reintentar', async () => {
      const user = userEvent.setup();
      listSentMock.mockRejectedValueOnce(apiError('NETWORK_ERROR', 0));
      renderPage('/admin/notificaciones?tab=enviadas');
      expect(
        await screen.findByText('No pudimos cargar las notificaciones enviadas'),
      ).toBeInTheDocument();
      listSentMock.mockResolvedValue({ items: [sent()], nextCursor: null });
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('table')).toBeInTheDocument();
    });

    it('lista fecha en hora de Lima, título, destinatarios, origen y correo', async () => {
      listSentMock.mockResolvedValue({
        items: [
          sent(),
          sent({
            notificationId: 'n-2',
            title: 'Pago confirmado',
            origin: 'SYSTEM',
            segment: null,
            event: 'PAYMENT_SUCCEEDED',
            alsoEmail: false,
            recipientCount: 1,
            createdAt: '2026-07-09T05:00:00Z',
          }),
        ],
        nextCursor: null,
      });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByRole('table');
      const [manual, system] = bodyRows();
      expect(manual).toHaveTextContent('10:30');
      expect(manual).toHaveTextContent('Regulariza tu membresía');
      expect(manual).toHaveTextContent('34');
      expect(manual).toHaveTextContent('Manual');
      expect(manual).toHaveTextContent('Sí');
      expect(system).toHaveTextContent('Sistema');
      expect(system).toHaveTextContent('00:00');
      expect(system).toHaveTextContent('No');
    });

    it('"Cargar más" pide la página siguiente con el cursor', async () => {
      const user = userEvent.setup();
      listSentMock.mockResolvedValueOnce({ items: [sent()], nextCursor: 'cursor-2' });
      listSentMock.mockResolvedValueOnce({
        items: [sent({ notificationId: 'n-2', title: 'Segundo aviso' })],
        nextCursor: null,
      });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByRole('table');
      await user.click(screen.getByRole('button', { name: 'Cargar más' }));
      expect(await screen.findByText('Segundo aviso')).toBeInTheDocument();
      expect(listSentMock).toHaveBeenLastCalledWith('cursor-2');
      expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
    });

    it('un clic abre el panel con el detalle y Escape lo cierra devolviendo el foco', async () => {
      const user = userEvent.setup();
      listSentMock.mockResolvedValue({ items: [sent()], nextCursor: null });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByRole('table');
      const row = bodyRows()[0]!;
      await user.click(row);

      const drawer = await screen.findByRole('dialog', { name: 'Regulariza tu membresía' });
      expect(within(drawer).getByText(/Tienes un saldo pendiente\./)).toBeInTheDocument();
      expect(within(drawer).getByText('Socios con deuda')).toBeInTheDocument();
      expect(within(drawer).getByText('34')).toBeInTheDocument();
      expect(within(drawer).getByText('Con correo')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(row).toHaveFocus();
    });

    it('Enter sobre la fila enfocada abre el panel; un aviso del sistema muestra su evento', async () => {
      const user = userEvent.setup();
      listSentMock.mockResolvedValue({
        items: [
          sent({
            origin: 'SYSTEM',
            segment: null,
            event: 'PAYMENT_SUCCEEDED',
            title: 'Pago confirmado',
            alsoEmail: false,
          }),
        ],
        nextCursor: null,
      });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByRole('table');
      bodyRows()[0]!.focus();
      await user.keyboard('{Enter}');
      const drawer = await screen.findByRole('dialog', { name: 'Pago confirmado' });
      expect(within(drawer).getByText('Evento')).toBeInTheDocument();
      expect(within(drawer).getAllByText('Pago confirmado').length).toBeGreaterThan(0);
      expect(within(drawer).getByText('Sistema', { selector: 'dd' })).toBeInTheDocument();
    });

    it('nombra la instalación en un aviso BY_RESOURCE', async () => {
      const user = userEvent.setup();
      listSentMock.mockResolvedValue({
        items: [sent({ segment: 'BY_RESOURCE', resourceId: 'parrilla-1' })],
        nextCursor: null,
      });
      renderPage('/admin/notificaciones?tab=enviadas');
      await screen.findByRole('table');
      await user.click(bodyRows()[0]!);
      const drawer = await screen.findByRole('dialog');
      await waitFor(() =>
        expect(
          within(drawer).getByText(/Titulares de reservas de una instalación: Parrilla 1/),
        ).toBeInTheDocument(),
      );
    });
  });
});
