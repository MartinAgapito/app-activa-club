// Mis pagos (US-050): tabla con estados en español, panel de detalle sin datos
// de tarjeta ni de Stripe, "Cargar más", vacío, error y cursor inválido.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PaymentSummary } from '@activa-club/shared-types';
import { PaymentsPage } from './PaymentsPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { listMock, signOutMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock('../../payments/payments-list-client', () => ({
  PAYMENTS_PAGE_SIZE: 20,
  fetchRecentPayments: vi.fn(),
  listMyPayments: listMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

function payment(overrides: Partial<PaymentSummary> = {}): PaymentSummary {
  return {
    paymentId: 'pay-1',
    memberId: 'm-1',
    membershipType: 'ANNUAL',
    amount: 120000,
    currency: 'PEN',
    paymentStatus: 'SUCCEEDED',
    stripePaymentIntentId: 'pi_3PSECRETO',
    createdAt: '2026-07-09T05:00:00Z',
    confirmedAt: '2026-07-09T05:00:05Z',
    ...overrides,
  };
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const THREE = [
  payment({ paymentId: 'pay-ok' }),
  payment({
    paymentId: 'pay-wait',
    membershipType: 'MONTHLY',
    amount: 15000,
    paymentStatus: 'PENDING_CONFIRMATION',
    confirmedAt: null,
    createdAt: '2026-06-09T05:00:00Z',
  }),
  payment({
    paymentId: 'pay-bad',
    membershipType: 'MONTHLY',
    amount: 15000,
    paymentStatus: 'FAILED',
    confirmedAt: null,
    createdAt: '2026-05-09T05:00:00Z',
  }),
];

describe('PaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista los pagos con estados en español y monto en soles', async () => {
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    expect(screen.getByRole('heading', { name: 'Mis pagos' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(table).getByText('Pagado')).toBeInTheDocument();
    expect(within(table).getByText('En verificación')).toBeInTheDocument();
    expect(within(table).getByText('Rechazado')).toBeInTheDocument();
    expect(within(table).getByText(/1,200\.00/)).toBeInTheDocument();
    expect(screen.queryByText('SUCCEEDED')).not.toBeInTheDocument();
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith(null);
  });

  it('abre el detalle con Enter sin exponer datos de Stripe', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1]!;
    row.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'Detalle del pago' });
    expect(within(dialog).getByText('Membresía anual')).toBeInTheDocument();
    expect(within(dialog).getByText('pay-ok')).toBeInTheDocument();
    expect(within(dialog).getByText('Pagado')).toBeInTheDocument();
    expect(within(dialog).queryByText(/pi_3P/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/tarjeta/i)).not.toBeInTheDocument();
  });

  it('un pago rechazado explica que no hubo cargo y enlaza a membresía', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(within(table).getAllByRole('row')[3]!);

    const dialog = await screen.findByRole('dialog', { name: 'Detalle del pago' });
    expect(within(dialog).getByText(/no se realizó ningún cargo/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ir a membresía' })).toHaveAttribute(
      'href',
      '/socio/membresia',
    );
  });

  it('un pago en verificación avisa que se actualizará al recargar', async () => {
    const user = userEvent.setup();
    listMock.mockResolvedValue({ items: THREE, nextCursor: null });
    renderPage();

    const table = await screen.findByRole('table');
    await user.click(within(table).getAllByRole('row')[2]!);

    const dialog = await screen.findByRole('dialog', { name: 'Detalle del pago' });
    expect(within(dialog).getByRole('status')).toHaveTextContent(/verificando/i);
  });

  it('carga más con nextCursor y oculta el botón al terminar', async () => {
    const user = userEvent.setup();
    listMock
      .mockResolvedValueOnce({ items: [THREE[0]], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [THREE[1]], nextCursor: null });
    renderPage();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('c2'));
    await waitFor(() =>
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3),
    );
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('sin pagos muestra el vacío con enlace a membresía', async () => {
    listMock.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();

    expect(await screen.findByText('Aún no tienes pagos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir a membresía' })).toHaveAttribute(
      'href',
      '/socio/membresia',
    );
  });

  it('muestra error con Reintentar y se recupera', async () => {
    const user = userEvent.setup();
    listMock
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'boom'))
      .mockResolvedValueOnce({ items: [THREE[0]], nextCursor: null });
    renderPage();

    expect(await screen.findByText('No pudimos cargar tus pagos')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('con sesión vencida ofrece iniciar sesión', async () => {
    const user = userEvent.setup();
    listMock.mockRejectedValue(new ApiRequestError(401, 'UNAUTHENTICATED', 'x'));
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(signOutMock).toHaveBeenCalled();
  });

  it('un cursor inválido (400) vuelve a la primera página', async () => {
    const user = userEvent.setup();
    listMock
      .mockResolvedValueOnce({ items: [THREE[0]], nextCursor: 'viejo' })
      .mockRejectedValueOnce(new ApiRequestError(400, 'VALIDATION_ERROR', 'cursor'))
      .mockResolvedValueOnce({ items: [THREE[0]], nextCursor: null });
    renderPage();

    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    await waitFor(() => expect(listMock).toHaveBeenCalledTimes(3));
    expect(listMock).toHaveBeenLastCalledWith(null);
    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByText('No pudimos cargar tus pagos')).not.toBeInTheDocument();
  });
});
