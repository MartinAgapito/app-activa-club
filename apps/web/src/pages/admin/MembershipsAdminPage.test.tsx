// Pagos de los socios (US-053): planes, filtros por estado y DNI, tabla,
// paginación, panel de detalle sin datos de tarjeta y estados de error.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@activa-club/ui';
import type { MembershipPlan, PaymentSummary } from '@activa-club/shared-types';
import { MembershipsAdminPage } from './MembershipsAdminPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { listMock, detailMock, plansMock, lookupMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  detailMock: vi.fn(),
  plansMock: vi.fn(),
  lookupMock: vi.fn(),
}));

vi.mock('../../admin/payments/admin-payments-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../admin/payments/admin-payments-client')>()),
  listAdminPayments: listMock,
  fetchAdminPaymentDetail: detailMock,
}));
vi.mock('../../members/plans-client', () => ({ fetchMembershipPlans: plansMock }));
vi.mock('../../reservations/reservations-client', () => ({ lookupMemberByDni: lookupMock }));

const PLANS: MembershipPlan[] = [
  { type: 'MONTHLY', amount: 15000, currency: 'PEN', label: 'Mensual' },
  { type: 'ANNUAL', amount: 120000, currency: 'PEN', label: 'Anual' },
];

function payment(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    paymentId: 'pay-1',
    memberId: '01JMEMBER000000000000ABCDEF',
    membershipType: 'ANNUAL',
    amount: 120000,
    currency: 'PEN',
    paymentStatus: 'FAILED',
    stripePaymentIntentId: 'pi_3PTEST',
    // 05:00Z = 00:00 en Lima
    createdAt: '2026-07-09T05:00:00Z',
    confirmedAt: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function renderPage(initialEntry = '/admin/membresias') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <MembershipsAdminPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function listByStatus(map: Record<string, PaymentSummary[]>) {
  listMock.mockImplementation(async (filters: { status?: string; memberId?: string }) => ({
    items: map[filters.status ?? 'ALL'] ?? [],
    nextCursor: null,
  }));
}

describe('MembershipsAdminPage (US-053)', () => {
  afterEach(() => {
    listMock.mockReset();
    detailMock.mockReset();
    plansMock.mockReset();
    lookupMock.mockReset();
  });

  it('muestra los planes vigentes con su precio', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({});
    renderPage();
    const plans = await screen.findByRole('region', { name: 'Planes vigentes' });
    await within(plans).findByText('Mensual');
    expect(within(plans).getByText(/150\.00/)).toBeInTheDocument();
    expect(within(plans).getByText(/1,?200\.00/)).toBeInTheDocument();
  });

  it('por defecto consulta rechazados y en verificación, nunca sin filtro', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({
      FAILED: [payment({ paymentId: 'pay-f', createdAt: '2026-07-09T05:00:00Z' })],
      PENDING_CONFIRMATION: [
        payment({
          paymentId: 'pay-p',
          paymentStatus: 'PENDING_CONFIRMATION',
          createdAt: '2026-07-10T17:30:00Z',
          membershipType: 'MONTHLY',
          amount: 15000,
        }),
      ],
    });
    renderPage();
    await screen.findByText('En verificación', { selector: 'span' });
    const statuses = listMock.mock.calls.map(([f]) => f.status).sort();
    expect(statuses).toEqual(['FAILED', 'PENDING_CONFIRMATION']);
    for (const [filters] of listMock.mock.calls) {
      expect(filters.status).toBeDefined();
    }
    const rows = screen.getAllByRole('row').slice(1);
    // Más reciente primero, en hora de Lima (17:30Z = 12:30).
    expect(within(rows[0]!).getByText(/12:30/)).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Mensual')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Rechazado')).toBeInTheDocument();
  });

  it('filtra por estado pagado', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({
      FAILED: [payment()],
      SUCCEEDED: [payment({ paymentId: 'pay-s', paymentStatus: 'SUCCEEDED' })],
    });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Rechazado', { selector: 'span' });
    await user.selectOptions(screen.getByLabelText('Estado'), 'SUCCEEDED');
    await screen.findByText('Pagado', { selector: 'span' });
    expect(screen.queryByText('Rechazado', { selector: 'span' })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('estado=SUCCEEDED');
  });

  it('busca un socio por DNI y filtra por su memberId', async () => {
    plansMock.mockResolvedValue(PLANS);
    listMock.mockImplementation(async (filters: { memberId?: string; status?: string }) => ({
      items: filters.memberId ? [payment({ paymentStatus: 'SUCCEEDED' })] : [],
      nextCursor: null,
    }));
    lookupMock.mockResolvedValue({
      memberId: '01JMEMBER000000000000ABCDEF',
      firstName: 'María',
      lastName: 'Quispe',
    });
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('DNI del socio'), '45678912');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(lookupMock).toHaveBeenCalledWith('45678912');
    await waitFor(() =>
      expect(listMock).toHaveBeenCalledWith(
        expect.objectContaining({ memberId: '01JMEMBER000000000000ABCDEF' }),
      ),
    );
    expect((await screen.findAllByText('María Quispe')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('location')).toHaveTextContent('socio=01JMEMBER');
  });

  it('valida el DNI y avisa cuando no existe', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({});
    lookupMock.mockRejectedValue(new ApiRequestError(404, 'DNI_NOT_FOUND', 'No existe'));
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText('DNI del socio'), '123');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
    expect(lookupMock).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('DNI del socio'));
    await user.type(screen.getByLabelText('DNI del socio'), '45678912');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText(/No encontramos un socio con ese DNI/)).toBeInTheDocument();
  });

  it('llegar con ?socio= filtra por ese socio con todos sus estados', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({ ALL: [payment({ paymentStatus: 'SUCCEEDED' })] });
    renderPage('/admin/membresias?socio=01JMEMBER000000000000ABCDEF');
    await screen.findByText('Pagado', { selector: 'span' });
    expect(listMock).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: '01JMEMBER000000000000ABCDEF', status: undefined }),
    );
  });

  it('pide un filtro cuando se eligen "todos los estados" sin socio', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({});
    renderPage('/admin/membresias?estado=todos');
    expect(await screen.findByText('Elige un estado o busca un socio')).toBeInTheDocument();
    expect(listMock).not.toHaveBeenCalled();
  });

  it('muestra el estado vacío', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({});
    renderPage();
    expect(await screen.findByText('No hay pagos con este filtro')).toBeInTheDocument();
  });

  it('muestra el error de carga y reintenta', async () => {
    plansMock.mockResolvedValue(PLANS);
    listMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Falla del servidor'),
    );
    listMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Falla del servidor'),
    );
    listByStatus({});
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('No pudimos cargar los pagos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() =>
      expect(screen.queryByText('No pudimos cargar los pagos')).not.toBeInTheDocument(),
    );
  });

  it('carga más pagos con el cursor', async () => {
    plansMock.mockResolvedValue(PLANS);
    listMock.mockImplementation(async (filters: { cursor?: string | null }) =>
      filters.cursor
        ? { items: [payment({ paymentId: 'pay-2', membershipType: 'MONTHLY' })], nextCursor: null }
        : { items: [payment({ paymentId: 'pay-1' })], nextCursor: 'c1' },
    );
    const user = userEvent.setup();
    renderPage('/admin/membresias?estado=FAILED');
    await user.click(await screen.findByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(3));
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'c1' }));
  });

  it('abre el detalle con la referencia de la pasarela y sin datos de tarjeta', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({ FAILED: [payment()] });
    detailMock.mockResolvedValue(payment());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByText('Rechazado', { selector: 'span' }));
    const panel = await screen.findByRole('dialog', { name: 'Detalle del pago' });
    expect(await within(panel).findByText('pi_3PTEST')).toBeInTheDocument();
    expect(within(panel).getByText('Sin confirmar')).toBeInTheDocument();
    expect(within(panel).getByText('Anual')).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/tarjeta\s*\*|\*{4}|CVV|pm_/i);
    expect(screen.getByTestId('location')).toHaveTextContent('pago=pay-1');
    expect(detailMock).toHaveBeenCalledWith('pay-1');
  });

  it('abre el detalle con Enter desde el teclado y filtra por socio desde el panel', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({ FAILED: [payment()], ALL: [payment({ paymentStatus: 'SUCCEEDED' })] });
    detailMock.mockResolvedValue(payment());
    const user = userEvent.setup();
    renderPage();
    const row = await screen.findByRole('row', { name: /Ver detalle del pago/ });
    row.focus();
    await user.keyboard('{Enter}');
    const panel = await screen.findByRole('dialog', { name: 'Detalle del pago' });
    await user.click(
      within(panel).getByRole('button', { name: /Ver todos los pagos de este socio/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('socio=01JMEMBER000000000000ABCDEF'),
    );
    expect(screen.getByTestId('location')).not.toHaveTextContent('pago=');
  });

  it('informa cuando el pago del detalle no existe', async () => {
    plansMock.mockResolvedValue(PLANS);
    listByStatus({});
    detailMock.mockRejectedValue(new ApiRequestError(404, 'NOT_FOUND', 'Pago no encontrado'));
    renderPage('/admin/membresias?pago=pay-x');
    expect(await screen.findByText('No encontramos este pago')).toBeInTheDocument();
  });
});
