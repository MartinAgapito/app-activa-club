// US-022 — checkout de pago de membresía.
// Cubre: selección de plan (con y sin preselección por query param), los 4
// resultados posibles de `POST /payments` (SUCCEEDED, PENDING_CONFIRMATION,
// PAYMENT_FAILED, PAYMENT_DUPLICATE), `MEMBER_NOT_APPROVED`, doble clic con
// la misma `idempotencyKey` (P-04), estados de carga/deshabilitado, que
// ningún dato de tarjeta viaje a `POST /payments` ni se persista fuera de
// Culqi.js (RN-PAG-08), y que no se ofrezca ningún medio de pago distinto de
// tarjeta (RN-PAG-05).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { CreatePaymentResponse, MembershipPlan } from '@activa-club/shared-types';
import { CheckoutPage } from './CheckoutPage';
import { ApiRequestError } from '../../lib/api/http-client';
import { MEMBER_PROFILE_QUERY_KEY } from '../../members/profile-query';
import { CulqiError } from '../../payments/culqi';

const { fetchMembershipPlansMock, requestCulqiTokenMock, createPaymentMock, signOutMock } =
  vi.hoisted(() => ({
    fetchMembershipPlansMock: vi.fn(),
    requestCulqiTokenMock: vi.fn(),
    createPaymentMock: vi.fn(),
    signOutMock: vi.fn(),
  }));

vi.mock('../../members/plans-client', () => ({
  fetchMembershipPlans: fetchMembershipPlansMock,
}));

vi.mock('../../payments/culqi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../payments/culqi')>();
  return { ...actual, requestCulqiToken: requestCulqiTokenMock };
});

vi.mock('../../payments/payments-client', () => ({
  createPayment: createPaymentMock,
}));

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ signOut: signOutMock }),
}));

const BASE_PLANS: MembershipPlan[] = [
  { type: 'MONTHLY', amount: 12000, currency: 'PEN', label: 'Mensual' },
  { type: 'ANNUAL', amount: 120000, currency: 'PEN', label: 'Anual', allowsInstallments: false },
];

const SUCCESS_RESPONSE: CreatePaymentResponse = {
  paymentId: '01J-PAY-1',
  paymentStatus: 'SUCCEEDED',
  membershipType: 'ANNUAL',
  amount: 120000,
  currency: 'PEN',
  membershipEndsAt: '2027-01-01T00:00:00Z',
};

function renderPage(initialEntry = '/socio/membresia/pagar?plan=ANNUAL') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(MEMBER_PROFILE_QUERY_KEY, { memberStatus: 'APPROVED' });

  const router = createMemoryRouter(
    [
      { path: '/socio/membresia/pagar', element: <CheckoutPage /> },
      { path: '/socio', element: <p>Dashboard de socio</p> },
      { path: '/socio/membresia', element: <p>Mi membresía</p> },
      { path: '/cuenta/pendiente-aprobacion', element: <p>Cuenta pendiente</p> },
    ],
    { initialEntries: [initialEntry] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { queryClient };
}

describe('CheckoutPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMembershipPlansMock.mockReset();
    requestCulqiTokenMock.mockReset();
    createPaymentMock.mockReset();
    signOutMock.mockReset();
  });

  it('muestra un estado de carga mientras obtiene los planes', () => {
    fetchMembershipPlansMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Cargando los planes de membresía…')).toBeInTheDocument();
  });

  it('sin plan preseleccionado, permite elegir uno de la lista (criterio 1)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage('/socio/membresia/pagar');

    expect(
      await screen.findByRole('heading', { name: /elige un plan para pagar/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('S/ 120.00')).toBeInTheDocument();
    expect(screen.getByText('S/ 1,200.00')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /elegir este plan/i })[0]!);

    expect(await screen.findByRole('heading', { name: /pagar membresía/i })).toBeInTheDocument();
    expect(screen.getByText('Plan Mensual')).toBeInTheDocument();
  });

  it('con un plan preseleccionado por query param, va directo al paso de pago', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage('/socio/membresia/pagar?plan=ANNUAL');

    expect(await screen.findByRole('heading', { name: /pagar membresía/i })).toBeInTheDocument();
    expect(screen.getByText('Plan Anual')).toBeInTheDocument();
    expect(screen.getByText('S/ 1,200.00')).toBeInTheDocument();
  });

  it('no ofrece ningún medio de pago distinto de tarjeta (RN-PAG-05)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    await screen.findByRole('heading', { name: /pagar membresía/i });
    // La única acción de pago disponible es "Pagar con tarjeta"; no se
    // ofrece ningún botón/opción para Yape, Plin, efectivo o transferencia.
    const actionButtons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(actionButtons).toEqual(['Pagar con tarjeta']);
  });

  it('pago exitoso: confirma el plan, invalida el perfil y ofrece ir a /socio (criterio 7)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_123');
    createPaymentMock.mockResolvedValueOnce(SUCCESS_RESPONSE);
    const { queryClient } = renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(await screen.findByRole('heading', { name: /pago confirmado/i })).toBeInTheDocument();
    expect(screen.getByText('S/ 1,200.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ir a mi área de socio/i })).toHaveAttribute(
      'href',
      '/socio',
    );

    // Criterio 4: únicamente membershipType, culqiToken e idempotencyKey.
    expect(createPaymentMock).toHaveBeenCalledTimes(1);
    const [request] = createPaymentMock.mock.calls[0] as [Record<string, unknown>];
    expect(Object.keys(request).sort()).toEqual(['culqiToken', 'idempotencyKey', 'membershipType']);
    expect(request['membershipType']).toBe('ANNUAL');
    expect(request['culqiToken']).toBe('tkn_test_123');
    expect(typeof request['idempotencyKey']).toBe('string');

    // Criterio 7: se invalida la consulta de perfil cacheada.
    await waitFor(() => {
      expect(queryClient.getQueryState(MEMBER_PROFILE_QUERY_KEY)?.isInvalidated).toBe(true);
    });
  });

  it('pago rechazado (PAYMENT_FAILED): mensaje claro y permite reintentar con un token nuevo (criterio 8)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValue('tkn_test_1');
    createPaymentMock.mockRejectedValueOnce(
      new ApiRequestError(422, 'PAYMENT_FAILED', 'Tarjeta rechazada por el emisor.'),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(await screen.findByText(/tu tarjeta fue rechazada/i)).toBeInTheDocument();
    expect(screen.queryByText(/tarjeta rechazada por el emisor/i)).not.toBeInTheDocument();

    createPaymentMock.mockResolvedValueOnce(SUCCESS_RESPONSE);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_2');
    await user.click(screen.getByRole('button', { name: /intentar con otra tarjeta/i }));
    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    await screen.findByRole('heading', { name: /pago confirmado/i });
    expect(createPaymentMock).toHaveBeenCalledTimes(2);
    const [firstCall] = createPaymentMock.mock.calls[0] as [{ idempotencyKey: string }];
    const [secondCall] = createPaymentMock.mock.calls[1] as [{ idempotencyKey: string }];
    // Un reintento explícito tras un fallo es un intento nuevo: nueva clave.
    expect(secondCall.idempotencyKey).not.toBe(firstCall.idempotencyKey);
  });

  it('pago duplicado (PAYMENT_DUPLICATE): muestra el resultado previo y no ofrece cobrar de nuevo (criterio 9)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_1');
    createPaymentMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'PAYMENT_DUPLICATE', 'Ya existe un pago con esta clave.', [
        { field: 'paymentId', issue: '01J-OLD' },
        { field: 'paymentStatus', issue: 'SUCCEEDED' },
      ]),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(
      await screen.findByRole('heading', { name: /este pago ya fue procesado/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/SUCCEEDED/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /intentar/i })).not.toBeInTheDocument();
  });

  it('pago pendiente de confirmación: informa la verificación sin prometer activación (criterio 10)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_1');
    createPaymentMock.mockResolvedValueOnce({
      ...SUCCESS_RESPONSE,
      paymentStatus: 'PENDING_CONFIRMATION',
    });
    const { queryClient } = renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(
      await screen.findByRole('heading', { name: /tu pago está en verificación/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/historial de pagos/i)).toBeInTheDocument();
    // No se activó la membresía: no hay motivo para invalidar el perfil.
    expect(queryClient.getQueryState(MEMBER_PROFILE_QUERY_KEY)?.isInvalidated).toBeFalsy();
  });

  it('403 MEMBER_NOT_APPROVED: explica que la cuenta no está aprobada (criterio 11)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_1');
    createPaymentMock.mockRejectedValueOnce(
      new ApiRequestError(403, 'MEMBER_NOT_APPROVED', 'El socio debe estar aprobado o activo.'),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(
      await screen.findByRole('heading', { name: /tu cuenta todavía no puede pagar/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver el estado de mi cuenta/i })).toHaveAttribute(
      'href',
      '/cuenta/pendiente-aprobacion',
    );
  });

  it('caso alternativo: Culqi.js no carga — muestra un error explícito y no envía el pago', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockRejectedValueOnce(
      new CulqiError(
        'No pudimos cargar la pasarela de pago. Verifica tu conexión e intenta nuevamente.',
      ),
    );
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));

    expect(await screen.findByText(/no pudimos cargar la pasarela de pago/i)).toBeInTheDocument();
    expect(createPaymentMock).not.toHaveBeenCalled();
  });

  it('muestra el botón deshabilitado con indicador de carga mientras el pago está en curso (criterio 6)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockReturnValue(new Promise(() => {}));
    renderPage();
    const user = userEvent.setup();

    const payButton = await screen.findByRole('button', { name: /pagar con tarjeta/i });
    await user.click(payButton);

    expect(await screen.findByRole('button', { name: /procesando pago/i })).toBeDisabled();
  });

  it('doble clic en confirmar: un solo cargo, misma idempotencyKey (P-04)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    let resolveToken: (token: string) => void = () => {};
    requestCulqiTokenMock.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveToken = resolve;
      }),
    );
    createPaymentMock.mockResolvedValue(SUCCESS_RESPONSE);
    renderPage();

    const payButton = await screen.findByRole('button', { name: /pagar con tarjeta/i });
    fireEvent.click(payButton);
    fireEvent.click(payButton);

    resolveToken('tkn_test_double');
    await waitFor(() => expect(createPaymentMock).toHaveBeenCalledTimes(1));
    expect(requestCulqiTokenMock).toHaveBeenCalledTimes(1);
  });

  it('no persiste ningún dato de pago en localStorage fuera de Culqi.js (RN-PAG-08)', async () => {
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    requestCulqiTokenMock.mockResolvedValueOnce('tkn_test_123');
    createPaymentMock.mockResolvedValueOnce(SUCCESS_RESPONSE);
    renderPage();
    const user = userEvent.setup();
    const storageLengthBefore = window.localStorage.length;

    await user.click(await screen.findByRole('button', { name: /pagar con tarjeta/i }));
    await screen.findByRole('heading', { name: /pago confirmado/i });

    expect(window.localStorage.length).toBe(storageLengthBefore);
  });
});
