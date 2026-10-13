// Inicio del socio (US-056): una sola consulta `GET /dashboard/member` con
// saludo, aviso, membresía, accesos, reservas, avisos e instalaciones; los
// últimos pagos tienen su propio estado.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { MemberDashboard, PaymentSummary } from '@activa-club/shared-types';
import { MemberDashboardPage } from './MemberDashboardPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { dashboardMock, paymentsMock } = vi.hoisted(() => ({
  dashboardMock: vi.fn(),
  paymentsMock: vi.fn(),
}));

vi.mock('../../dashboard/member-dashboard-client', () => ({
  fetchMemberDashboard: dashboardMock,
}));
vi.mock('../../payments/payments-list-client', () => ({
  RECENT_PAYMENTS_LIMIT: 3,
  fetchRecentPayments: paymentsMock,
  listMyPayments: vi.fn(),
}));

const NOW = new Date('2026-10-11T15:00:00Z');

function dashboard(overrides: Partial<MemberDashboard> = {}): MemberDashboard {
  return {
    member: { firstName: 'Martín Alonso', memberStatus: 'ACTIVE' },
    membership: {
      type: 'MONTHLY',
      status: 'ACTIVE',
      endsAt: '2026-11-20T05:00:00Z',
      daysRemaining: 40,
      outstandingBalance: 0,
    },
    canReserve: true,
    alerts: [],
    upcomingReservations: [],
    recentNotifications: [],
    ...overrides,
  };
}

function payment(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    paymentId: 'pay-1',
    memberId: 'm-1',
    membershipType: 'MONTHLY',
    amount: 12000,
    currency: 'PEN',
    paymentStatus: 'SUCCEEDED',
    stripePaymentIntentId: null,
    createdAt: '2026-10-01T15:00:00Z',
    confirmedAt: '2026-10-01T15:00:05Z',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MemberDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MemberDashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    dashboardMock.mockReset().mockResolvedValue(dashboard());
    paymentsMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra un estado de carga y luego saluda con el nombre de pila y la fecha de Lima', async () => {
    renderPage();
    expect(screen.getByText('Cargando tu inicio…')).toBeVisible();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Martín' })).toBeVisible();
    expect(screen.getByText(/domingo, 11 de octubre de 2026/i)).toBeVisible();
    expect(dashboardMock).toHaveBeenCalledTimes(1);
  });

  it('socio al día: tipo, estado, vencimiento y días, sin aviso ni CTA en el pase', async () => {
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText('Al día')).toBeVisible();
    expect(within(pass).getByText(/Plan mensual/)).toBeVisible();
    expect(within(pass).getByText('Vence en 40 días')).toBeVisible();
    expect(within(pass).getByText(/20 nov.? 2026/)).toBeVisible();
    expect(within(pass).queryByRole('link')).toBeNull();
    expect(screen.queryByText('No puedes reservar por ahora')).toBeNull();
    expect(screen.getByRole('link', { name: 'Nueva reserva' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
    expect(screen.getByRole('link', { name: 'Renovar o pagar membresía' })).toHaveAttribute(
      'href',
      '/socio/membresia',
    );
  });

  it('tolera endsAt como YYYY-MM-DD sin correr el día', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        membership: {
          type: 'ANNUAL',
          status: 'ACTIVE',
          endsAt: '2026-12-01',
          daysRemaining: 51,
          outstandingBalance: 0,
        },
      }),
    );
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText(/1 dic.? 2026/)).toBeVisible();
  });

  it('por vencer: alerta del servidor informativa, Nueva reserva sigue disponible', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        membership: {
          type: 'ANNUAL',
          status: 'EXPIRING_SOON',
          endsAt: '2026-10-14T05:00:00Z',
          daysRemaining: 3,
          outstandingBalance: 0,
        },
        alerts: [{ code: 'RENEWAL_DUE', message: 'Tu membresía vence pronto.' }],
      }),
    );
    renderPage();
    const notice = await screen.findByRole('region', { name: 'Tu membresía vence pronto' });
    expect(within(notice).getByText('Tu membresía vence pronto.')).toBeVisible();
    expect(within(notice).getByRole('link', { name: 'Renovar membresía' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nueva reserva' })).toBeVisible();
    expect(screen.getByText('Vence en 3 días')).toBeVisible();
    // El código técnico nunca se muestra.
    expect(screen.queryByText('RENEWAL_DUE')).toBeNull();
  });

  it('con deuda: alerta, acción de pago, saldo y Nueva reserva deshabilitada con motivo', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        canReserve: false,
        membership: {
          type: 'MONTHLY',
          status: 'DEBT',
          endsAt: '2026-10-01T05:00:00Z',
          daysRemaining: null,
          outstandingBalance: 12000,
        },
        alerts: [{ code: 'PAYMENT_DEBT', message: 'Tienes un pago pendiente.' }],
      }),
    );
    renderPage();
    const notice = await screen.findByRole('region', { name: 'No puedes reservar por ahora' });
    expect(within(notice).getByText('Tienes un pago pendiente.')).toBeVisible();
    expect(within(notice).getByRole('link', { name: 'Pagar o renovar membresía' })).toHaveAttribute(
      'href',
      '/socio/membresia',
    );
    const pass = screen.getByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText(/S\/\s?120\.00/)).toBeVisible();
    expect(within(pass).getByRole('link', { name: 'Pagar membresía' })).toBeVisible();
    const reserve = screen.getByRole('button', { name: /Nueva reserva/ });
    expect(reserve).toBeDisabled();
    expect(reserve).toHaveAccessibleDescription(/saldo pendiente/i);
    expect(screen.queryByRole('link', { name: 'Nueva reserva' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Fútbol' })).toBeDisabled();
  });

  it('vencida: ofrece renovar y bloquea la reserva', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        canReserve: false,
        membership: {
          type: 'MONTHLY',
          status: 'EXPIRED',
          endsAt: '2026-10-01T05:00:00Z',
          daysRemaining: null,
          outstandingBalance: 0,
        },
        alerts: [{ code: 'MEMBERSHIP_EXPIRED', message: 'Tu membresía venció.' }],
      }),
    );
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText('Vencida')).toBeVisible();
    expect(within(pass).getByText(/Venció el/)).toBeVisible();
    expect(within(pass).getByRole('link', { name: 'Renovar membresía' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Nueva reserva/ })).toBeDisabled();
  });

  it('aprobado sin primera membresía: sin alertas ni canReserve, explica qué falta', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        member: { firstName: 'Lucía', memberStatus: 'APPROVED' },
        canReserve: false,
        membership: {
          type: null,
          status: 'NONE',
          endsAt: null,
          daysRemaining: null,
          outstandingBalance: 0,
        },
        alerts: [],
      }),
    );
    renderPage();
    const notice = await screen.findByRole('region', { name: 'No puedes reservar por ahora' });
    expect(within(notice).getByText(/Paga tu primera membresía/)).toBeVisible();
    const pass = screen.getByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText('Sin membresía activa')).toBeVisible();
    expect(within(pass).getByText(/solicitud fue aprobada/)).toBeVisible();
    expect(within(pass).getByRole('link', { name: 'Pagar membresía' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Nueva reserva/ })).toBeDisabled();
    expect(screen.queryByText(/Vence en/)).toBeNull();
  });

  it('lista las próximas reservas con tipo, día, hora de Lima y estado', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        upcomingReservations: [
          {
            reservationId: 'r-1',
            resourceType: 'FUTBOL',
            startsAt: '2026-10-14T23:00:00Z',
            reservationStatus: 'CONFIRMED',
          },
          {
            reservationId: 'r-2',
            resourceType: 'PARRILLA',
            startsAt: '2026-10-16T17:00:00Z',
            reservationStatus: 'PENDING_APPROVAL',
          },
        ],
      }),
    );
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(within(block).getByText('Fútbol')).toBeVisible();
    expect(within(block).getByText('18:00')).toBeVisible();
    expect(within(block).getByText('Confirmada')).toBeVisible();
    expect(within(block).getByText('Parrillas')).toBeVisible();
    expect(within(block).getByText('12:00')).toBeVisible();
    expect(within(block).getByText('Pendiente de aprobación')).toBeVisible();
    expect(within(block).getByRole('link', { name: 'Ver todas mis reservas' })).toHaveAttribute(
      'href',
      '/socio/reservas/mias',
    );
  });

  it('sin reservas próximas invita a reservar si puede', async () => {
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(within(block).getByText(/No tienes reservas próximas/)).toBeVisible();
    expect(within(block).getByRole('link', { name: 'Reservar una instalación' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('sin reservas y sin poder reservar no ofrece reservar', async () => {
    dashboardMock.mockResolvedValue(dashboard({ canReserve: false }));
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(within(block).queryByRole('link', { name: 'Reservar una instalación' })).toBeNull();
  });

  it('accesos directos a las seis instalaciones preseleccionan el tipo', async () => {
    renderPage();
    const block = await screen.findByRole('region', { name: 'Reservar una instalación' });
    const links = within(block).getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(within(block).getByRole('link', { name: 'Fútbol' })).toHaveAttribute(
      'href',
      '/socio/reservas?tipo=FUTBOL',
    );
    expect(within(block).getByRole('link', { name: 'Salón social' })).toHaveAttribute(
      'href',
      '/socio/reservas?tipo=SALON_SOCIAL',
    );
  });

  it('avisos recientes: destaca los no leídos y enlaza a la bandeja', async () => {
    dashboardMock.mockResolvedValue(
      dashboard({
        recentNotifications: [
          { notificationId: 'n-1', title: 'Reserva confirmada', readStatus: 'UNREAD' },
          { notificationId: 'n-2', title: 'Bienvenido al club', readStatus: 'READ' },
        ],
      }),
    );
    renderPage();
    const block = await screen.findByRole('region', { name: 'Avisos recientes' });
    expect(within(block).getByText('Reserva confirmada')).toBeVisible();
    expect(within(block).getAllByText('Nueva')).toHaveLength(1);
    expect(within(block).getByRole('link', { name: 'Ir a mis avisos' })).toHaveAttribute(
      'href',
      '/socio/notificaciones',
    );
  });

  it('sin avisos ni pagos: estados vacíos amables', async () => {
    renderPage();
    expect(await screen.findByText('No tienes avisos recientes.')).toBeVisible();
    expect(await screen.findByText('Aún no tienes pagos registrados.')).toBeVisible();
  });

  it('resumen de pagos con fecha, monto y estado, y acceso al historial', async () => {
    paymentsMock.mockResolvedValue([
      payment(),
      payment({ paymentId: 'pay-2', paymentStatus: 'FAILED', amount: 5000 }),
    ]);
    renderPage();
    const block = await screen.findByRole('region', { name: 'Últimos pagos' });
    expect(await within(block).findByText('Pagado')).toBeVisible();
    expect(within(block).getByText(/S\/\s?120\.00/)).toBeVisible();
    expect(within(block).getByText('Rechazado')).toBeVisible();
    expect(within(block).getByRole('link', { name: 'Ver historial de pagos' })).toHaveAttribute(
      'href',
      '/socio/pagos',
    );
  });

  it('indica un último pago en verificación', async () => {
    paymentsMock.mockResolvedValue([payment({ paymentStatus: 'PENDING_CONFIRMATION' })]);
    renderPage();
    expect(await screen.findByText('Pago en verificación.')).toBeVisible();
  });

  it('si fallan los pagos, el resto del inicio se muestra y se puede reintentar', async () => {
    paymentsMock.mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    const block = await screen.findByRole('region', { name: 'Últimos pagos' });
    expect(await within(block).findByText('No pudimos cargar tus últimos pagos')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Mi membresía' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nueva reserva' })).toBeVisible();

    await user.click(within(block).getByRole('button', { name: 'Reintentar' }));
    expect(await within(block).findByText('Aún no tienes pagos registrados.')).toBeVisible();
  });

  it('si falla el dashboard: error con reintento y accesos básicos', async () => {
    dashboardMock.mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    expect(await screen.findByText('No pudimos cargar tu inicio')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Hola' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pagos' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Martín' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Mi membresía' })).toBeVisible();
  });
});
