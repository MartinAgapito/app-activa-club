// Inicio del socio (US-070): saludo, aviso de bloqueo, pase de membresía,
// accesos rápidos y próximas reservas, cada uno con sus estados
// independientes.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Member, PaymentSummary, Reservation } from '@activa-club/shared-types';
import { MemberDashboardPage } from './MemberDashboardPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { profileMock, upcomingMock, paymentMock, resourcesMock } = vi.hoisted(() => ({
  profileMock: vi.fn(),
  upcomingMock: vi.fn(),
  paymentMock: vi.fn(),
  resourcesMock: vi.fn(),
}));

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: profileMock,
  updateMemberProfile: vi.fn(),
}));
vi.mock('../../payments/payments-list-client', () => ({ fetchLatestPayment: paymentMock }));
vi.mock('../../resources/resources-client', () => ({
  fetchResources: resourcesMock,
  fetchResourceAvailability: vi.fn(),
}));
// Solo `GET /reservations` pasa por `apiRequest` (el resto de los clientes están
// mockeados arriba): se simula la página del contrato.
vi.mock('../../lib/api/http-client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/api/http-client')>();
  return { ...original, apiRequest: upcomingMock };
});

const NOW = new Date('2026-10-11T15:00:00Z');

function member(overrides: Partial<Member> = {}): Member {
  return {
    memberId: 'm-1',
    legacyId: null,
    dni: '12345678',
    email: 'martin@example.com',
    firstName: 'Martín Alonso',
    lastName: 'Agapito',
    phone: null,
    origin: 'NEW',
    memberStatus: 'ACTIVE',
    cognitoSub: 'sub-1',
    rejectionReason: null,
    membershipType: 'MONTHLY',
    membershipStatus: 'ACTIVE',
    membershipStartedAt: '2026-09-01T05:00:00Z',
    membershipEndsAt: '2026-11-20T05:00:00Z',
    outstandingBalance: 0,
    autoRenew: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    reservationId: 'res-1',
    resourceId: 'futbol-1',
    resourceType: 'FUTBOL',
    holderMemberId: 'm-1',
    startsAt: '2026-10-14T23:00:00Z',
    endsAt: '2026-10-15T00:30:00Z',
    reservationStatus: 'CONFIRMED',
    participantCount: 2,
    guestCount: 0,
    requiresApproval: false,
    rejectionReason: null,
    cancelledAt: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
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
    profileMock.mockReset().mockResolvedValue(member());
    upcomingMock.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    paymentMock.mockReset().mockResolvedValue(null);
    resourcesMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saluda con el nombre de pila y la fecha en hora de Lima', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Martín' })).toBeVisible();
    expect(screen.getByText(/domingo, 11 de octubre de 2026/i)).toBeVisible();
  });

  it('socio al día: pase con tipo, estado y días, sin CTA ni aviso', async () => {
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(await within(pass).findByText('Al día')).toBeVisible();
    expect(within(pass).getByText(/Plan mensual/)).toBeVisible();
    expect(within(pass).getByText('Vence en 40 días')).toBeVisible();
    expect(within(pass).queryByRole('link')).toBeNull();
    expect(screen.queryByText('No puedes reservar por ahora')).toBeNull();
    expect(screen.getByRole('link', { name: 'Reservar' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('con deuda: aviso con enlace a pagar, saldo, CTA y Reservar deshabilitado con motivo', async () => {
    profileMock.mockResolvedValue(member({ membershipStatus: 'DEBT', outstandingBalance: 12000 }));
    renderPage();
    const notice = await screen.findByRole('region', { name: 'No puedes reservar por ahora' });
    expect(within(notice).getByRole('link', { name: 'Pagar o renovar membresía' })).toHaveAttribute(
      'href',
      '/socio/membresia',
    );
    const pass = screen.getByRole('region', { name: 'Mi membresía' });
    expect(within(pass).getByText(/S\/\s?120\.00/)).toBeVisible();
    expect(within(pass).getByRole('link', { name: 'Pagar membresía' })).toBeVisible();
    const reserve = screen.getByRole('button', { name: /Reservar/ });
    expect(reserve).toBeDisabled();
    expect(screen.getByText(/regulariza tu membresía para reservar/i)).toBeVisible();
  });

  it('vencida: ofrece Renovar y bloquea la reserva', async () => {
    profileMock.mockResolvedValue(
      member({ membershipStatus: 'EXPIRED', membershipEndsAt: '2026-10-01T05:00:00Z' }),
    );
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(await within(pass).findByRole('link', { name: 'Renovar membresía' })).toBeVisible();
    expect(within(pass).getByText('Vencida')).toBeVisible();
    expect(screen.getByRole('button', { name: /Reservar/ })).toBeDisabled();
  });

  it('vence en 7 días o menos: aviso informativo sin bloquear Reservar', async () => {
    profileMock.mockResolvedValue(
      member({ membershipStatus: 'EXPIRING_SOON', membershipEndsAt: '2026-10-14T05:00:00Z' }),
    );
    renderPage();
    const notice = await screen.findByRole('region', { name: 'Tu membresía vence pronto' });
    expect(within(notice).getByRole('link', { name: 'Renovar membresía' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Reservar' })).toBeVisible();
  });

  it('sin fecha de vencimiento no inventa una', async () => {
    profileMock.mockResolvedValue(member({ membershipEndsAt: null }));
    renderPage();
    expect(await screen.findByText(/Aún no tienes una vigencia registrada/)).toBeVisible();
  });

  it('indica un último pago en verificación', async () => {
    paymentMock.mockResolvedValue({
      paymentStatus: 'PENDING_CONFIRMATION',
    } as PaymentSummary);
    renderPage();
    expect(await screen.findByText('Pago en verificación.')).toBeVisible();
  });

  it('si falla el último pago, el pase se muestra igual', async () => {
    paymentMock.mockRejectedValue(new Error('boom'));
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(await within(pass).findByText('Al día')).toBeVisible();
    expect(screen.queryByText('Pago en verificación.')).toBeNull();
  });

  it('lista las próximas reservas con nombre, hora, estado y enlace a Mis reservas', async () => {
    resourcesMock.mockResolvedValue([
      { resourceId: 'futbol-1', type: 'FUTBOL', name: 'Cancha de fútbol 1' },
    ]);
    upcomingMock.mockResolvedValue({
      items: [
        reservation(),
        reservation({
          reservationId: 'res-2',
          reservationStatus: 'PENDING_APPROVAL',
          resourceId: 'x',
          resourceType: 'PARRILLA',
        }),
      ],
      nextCursor: null,
    });
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(await within(block).findByText('Cancha de fútbol 1')).toBeVisible();
    expect(within(block).getAllByText('18:00 – 19:30')).toHaveLength(2);
    expect(within(block).getByText('Confirmada')).toBeVisible();
    expect(within(block).getByText('Parrillas')).toBeVisible();
    expect(within(block).getByText('Pendiente de aprobación')).toBeVisible();
    const links = within(block).getAllByRole('link', { name: /Cancha de fútbol 1/ });
    expect(links[0]).toHaveAttribute('href', '/socio/reservas/mias');
  });

  it('sin reservas próximas invita a reservar', async () => {
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(await within(block).findByText(/No tienes reservas próximas/)).toBeVisible();
    expect(within(block).getByRole('link', { name: 'Reservar una instalación' })).toHaveAttribute(
      'href',
      '/socio/reservas',
    );
  });

  it('si fallan las reservas, el resto del inicio sigue y se puede reintentar', async () => {
    upcomingMock.mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'x'));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    const block = await screen.findByRole('region', { name: 'Próximas reservas' });
    expect(await within(block).findByText('No pudimos cargar tus próximas reservas')).toBeVisible();
    expect(await screen.findByText('Al día')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pagos' })).toBeVisible();

    await user.click(within(block).getByRole('button', { name: 'Reintentar' }));
    expect(await within(block).findByText(/No tienes reservas próximas/)).toBeVisible();
  });

  it('si falla el perfil, el bloque de membresía ofrece reintentar y las reservas siguen', async () => {
    profileMock.mockRejectedValue(new Error('boom'));
    upcomingMock.mockResolvedValue({ items: [reservation()], nextCursor: null });
    renderPage();
    const pass = await screen.findByRole('region', { name: 'Mi membresía' });
    expect(await within(pass).findByText('No pudimos consultar tu membresía')).toBeVisible();
    expect(within(pass).getByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(await screen.findByText('Confirmada')).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Hola' })).toBeVisible();
  });
});
