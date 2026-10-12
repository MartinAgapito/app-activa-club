// Bandeja de notificaciones (US-041): tabla con estado en texto, pestañas con
// `?tab=`, panel de detalle que marca como leída de forma optimista (rollback
// y aviso solo si falla), "Cargar más", vacío y error con Reintentar.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { ToastProvider } from '@activa-club/ui';
import type { InboxNotification } from '@activa-club/shared-types';
import { NotificationsPage } from './NotificationsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { listMock, readMock, signOutMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  readMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../notifications/notifications-client', () => ({
  NOTIFICATIONS_PAGE_SIZE: 20,
  listMyNotifications: listMock,
  markNotificationRead: readMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

function notification(overrides: Partial<InboxNotification> = {}): InboxNotification {
  return {
    notificationId: 'n-1',
    title: 'Pago confirmado',
    body: 'Recibimos tu pago de la membresía anual.',
    event: 'PAYMENT_SUCCEEDED',
    readStatus: 'UNREAD',
    createdAt: '2026-07-09T05:30:00Z',
    readAt: null,
    ...overrides,
  };
}

const LOCATION_TESTID = 'location-search';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid={LOCATION_TESTID}>{location.search}</span>;
}

function renderPage(initialEntry = '/socio/notificaciones') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <NotificationsPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const THREE = [
  notification({ notificationId: 'n-new' }),
  notification({
    notificationId: 'n-res',
    title: 'Reserva aprobada',
    body: 'Tu reserva de parrilla fue aprobada.',
    event: 'RESERVATION_APPROVED',
    createdAt: '2026-07-08T15:00:00Z',
  }),
  notification({
    notificationId: 'n-old',
    title: 'Bienvenido al club',
    body: 'Tu cuenta quedó activada.',
    event: 'ACCOUNT_ACTIVATED',
    readStatus: 'READ',
    readAt: '2026-07-01T10:00:00Z',
    createdAt: '2026-07-01T09:00:00Z',
  }),
];

async function rows() {
  const table = await screen.findByRole('table');
  return within(table).getAllByRole('row').slice(1);
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista las notificaciones con estado en texto y fecha en hora de Lima', async () => {
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    expect(screen.getByRole('heading', { name: 'Notificaciones' })).toBeInTheDocument();
    const list = await rows();
    expect(list).toHaveLength(3);
    expect(within(list[0]!).getByText('Pago confirmado')).toBeInTheDocument();
    expect(within(list[0]!).getByText('No leída')).toBeInTheDocument();
    expect(within(list[2]!).getByText('Leída')).toBeInTheDocument();
    // 2026-07-09T05:30:00Z = 00:30 en Lima (UTC-5).
    expect(within(list[0]!).getByText(/9 jul.? 2026, 00:30/)).toBeInTheDocument();
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(null, false);
  });

  it('abrir con Enter muestra el detalle y marca como leída sin recargar', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    readMock.mockResolvedValue({ ...THREE[0], readStatus: 'READ', readAt: '2026-07-10T10:00:00Z' });
    renderPage();

    const list = await rows();
    list[0]!.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'Notificación' });
    expect(within(dialog).getByText('Pago confirmado')).toBeInTheDocument();
    expect(
      within(dialog).getByText('Recibimos tu pago de la membresía anual.'),
    ).toBeInTheDocument();
    expect(readMock).toHaveBeenCalledWith('n-new');
    expect(readMock).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(dialog).getByText('Leída')).toBeInTheDocument());
    expect(listMock).toHaveBeenCalledTimes(1);
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getAllByText('Leída')).toHaveLength(2);
    expect(within(table).getAllByText('No leída')).toHaveLength(1);
  });

  it('una notificación ya leída no vuelve a llamar al servidor', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    const list = await rows();
    await user.click(list[2]!);

    await screen.findByRole('dialog', { name: 'Notificación' });
    expect(readMock).not.toHaveBeenCalled();
  });

  it('si marcar como leída falla, restaura el estado y avisa con un toast', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    readMock.mockRejectedValue(new ApiRequestError(500, 'INTERNAL_ERROR', 'boom'));
    renderPage();

    const list = await rows();
    await user.click(list[0]!);

    expect(
      await screen.findByText(/No pudimos marcar la notificación como leída/),
    ).toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: 'Notificación' });
    await waitFor(() => expect(within(dialog).getByText('No leída')).toBeInTheDocument());
  });

  it('no muestra toast cuando marcar como leída funciona', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    readMock.mockResolvedValue({ ...THREE[0], readStatus: 'READ' });
    renderPage();

    const list = await rows();
    await user.click(list[0]!);

    await screen.findByRole('dialog', { name: 'Notificación' });
    await waitFor(() => expect(readMock).toHaveBeenCalled());
    expect(screen.queryByText(/No pudimos marcar/)).not.toBeInTheDocument();
  });

  it('las notificaciones de reserva y pago enlazan a su sección', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    readMock.mockResolvedValue({ ...THREE[1], readStatus: 'READ' });
    renderPage();

    const list = await rows();
    await user.click(list[1]!);

    const dialog = await screen.findByRole('dialog', { name: 'Notificación' });
    expect(within(dialog).getByRole('link', { name: 'Ir a Mis reservas' })).toHaveAttribute(
      'href',
      '/socio/reservas/mias',
    );
  });

  it('una notificación de cuenta no muestra enlace', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    const list = await rows();
    await user.click(list[2]!);

    const dialog = await screen.findByRole('dialog', { name: 'Notificación' });
    expect(within(dialog).queryByRole('link')).not.toBeInTheDocument();
  });

  it('la pestaña No leídas pide unread y se guarda en ?tab=', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();
    await rows();

    await user.click(screen.getByRole('tab', { name: 'No leídas' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledWith(null, true));
    expect(screen.getByTestId(LOCATION_TESTID)).toHaveTextContent('tab=no-leidas');
  });

  it('entra directo a No leídas con ?tab=no-leidas', async () => {
    listMock.mockResolvedValue({ items: [THREE[0]], nextCursor: null });
    renderPage('/socio/notificaciones?tab=no-leidas');

    expect(await rows()).toHaveLength(1);
    expect(listMock).toHaveBeenCalledWith(null, true);
    expect(screen.getByRole('tab', { name: 'No leídas' })).toHaveAttribute('aria-selected', 'true');
  });

  it('estado vacío: No tienes notificaciones', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    expect(await screen.findByText('No tienes notificaciones')).toBeInTheDocument();
  });

  it('estado vacío de No leídas', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage('/socio/notificaciones?tab=no-leidas');

    expect(await screen.findByText('No tienes notificaciones sin leer')).toBeInTheDocument();
  });

  it('error de carga con Reintentar', async () => {
    const user = userEvent.setup();
    listMock.mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'boom'));
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    expect(await screen.findByText('No pudimos cargar tus notificaciones')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await rows()).toHaveLength(3);
  });

  it('sesión expirada ofrece Iniciar sesión', async () => {
    const user = userEvent.setup();
    listMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'expired'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(signOutMock).toHaveBeenCalled();
  });

  it('Cargar más pide la siguiente página con el cursor', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValueOnce({ items: [THREE[0]], nextCursor: 'cursor-2' });
    listMock.mockResolvedValueOnce({ items: [THREE[2]], nextCursor: null });
    renderPage();

    expect(await rows()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /cargar más/i }));

    await waitFor(async () => expect(await rows()).toHaveLength(2));
    expect(listMock).toHaveBeenLastCalledWith('cursor-2', false);
  });
});
