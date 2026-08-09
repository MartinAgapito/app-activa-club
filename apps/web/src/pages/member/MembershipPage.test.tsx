// US-020 — consultar los planes de membresía disponibles — y US-023 —
// renovar la membresía y autorizar la renovación automática.
// Cubre: estados de carga y error (con reintento) de cada sección de forma
// independiente (criterio 5 de US-020 — no bloquear la consulta de planes),
// el renderizado de los dos planes con precio formateado en soles y duración
// (criterios 1 y 4 de US-020), el estado de la membresía vigente del socio
// (criterio 5 de US-020), que `allowsInstallments: false` no ofrezca la
// opción de facilidades de pago (caso alternativo), y de US-023: el estado
// real de `autoRenew` (criterio 8), activarla y desactivarla con
// confirmación explícita y visible (criterios 6 y 7), y que la preferencia
// esté desactivada por defecto (criterio 5).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Member, MembershipPlan } from '@activa-club/shared-types';
import { MembershipPage } from './MembershipPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchMemberProfileMock, fetchMembershipPlansMock, updateAutoRenewMock } = vi.hoisted(
  () => ({
    fetchMemberProfileMock: vi.fn(),
    fetchMembershipPlansMock: vi.fn(),
    updateAutoRenewMock: vi.fn(),
  }),
);

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: fetchMemberProfileMock,
}));

vi.mock('../../members/plans-client', () => ({
  fetchMembershipPlans: fetchMembershipPlansMock,
}));

vi.mock('../../members/auto-renew-client', () => ({
  updateAutoRenew: updateAutoRenewMock,
}));

const BASE_MEMBER: Member = {
  memberId: '01J...',
  legacyId: null,
  dni: '45678912',
  email: 'maria.quispe@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: '999111222',
  origin: 'MIGRATED',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-123',
  rejectionReason: null,
  membershipType: 'ANNUAL',
  membershipStatus: 'ACTIVE',
  membershipStartedAt: '2026-01-01T00:00:00Z',
  membershipEndsAt: '2027-01-01T00:00:00Z',
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const BASE_PLANS: MembershipPlan[] = [
  { type: 'MONTHLY', amount: 12000, currency: 'PEN', label: 'Mensual' },
  { type: 'ANNUAL', amount: 120000, currency: 'PEN', label: 'Anual', allowsInstallments: false },
];

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/socio/membresia', element: <MembershipPage /> },
      { path: '/socio/membresia/pagar', element: <p>Checkout</p> },
    ],
    { initialEntries: ['/socio/membresia'] },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('MembershipPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMemberProfileMock.mockReset();
    fetchMembershipPlansMock.mockReset();
    updateAutoRenewMock.mockReset();
  });

  it('muestra estados de carga independientes para la membresía y los planes', () => {
    fetchMemberProfileMock.mockReturnValue(new Promise(() => {}));
    fetchMembershipPlansMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Consultando el estado de tu membresía…')).toBeInTheDocument();
    expect(screen.getByText('Cargando los planes de membresía…')).toBeInTheDocument();
  });

  it('muestra los planes con precio formateado en soles, etiqueta y duración (criterios 1 y 4)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    expect(await screen.findByText('Mensual')).toBeInTheDocument();
    expect(screen.getByText('S/ 120.00')).toBeInTheDocument();
    expect(screen.getByText('1 mes de vigencia')).toBeInTheDocument();

    expect(screen.getByText('Anual')).toBeInTheDocument();
    expect(screen.getByText('S/ 1,200.00')).toBeInTheDocument();
    expect(screen.getByText('1 año de vigencia')).toBeInTheDocument();
  });

  it('enlaza "Pagar este plan" al checkout con el plan elegido (US-022)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    await screen.findByText('Mensual');
    const links = screen.getAllByRole('link', { name: /pagar este plan/i });
    expect(links[0]).toHaveAttribute('href', '/socio/membresia/pagar?plan=MONTHLY');
    expect(links[1]).toHaveAttribute('href', '/socio/membresia/pagar?plan=ANNUAL');
  });

  it('no ofrece facilidades de pago cuando allowsInstallments es false (caso alternativo)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    await screen.findByText('Anual');
    expect(screen.queryByText(/admite facilidades de pago/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sin facilidades de pago disponibles/i)).toBeInTheDocument();
  });

  it('indica facilidades de pago cuando allowsInstallments es true', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockResolvedValueOnce([
      BASE_PLANS[0]!,
      { ...BASE_PLANS[1]!, allowsInstallments: true },
    ]);
    renderPage();

    expect(await screen.findByText(/admite facilidades de pago/i)).toBeInTheDocument();
  });

  it('muestra hasta cuándo está vigente la membresía del socio (criterio 5)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    expect(await screen.findByText(/vigente hasta el/i)).toBeInTheDocument();
    expect(screen.getByText(/pagar un plan extiende tu vigencia/i)).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
  });

  it('muestra los planes aunque falle la consulta de la membresía, sin bloquearla (criterio 5)', async () => {
    fetchMemberProfileMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: /no pudimos consultar el estado de tu membresía/i,
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Mensual')).toBeInTheDocument();
  });

  it('muestra un estado de error con reintento si falla la carga de los planes', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    fetchMembershipPlansMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /no pudimos cargar los planes/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ocurrió un error interno.')).toBeInTheDocument();

    fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByText('Mensual')).toBeInTheDocument();
  });

  describe('renovación automática (US-023)', () => {
    it('muestra el estado real desactivado leído del backend, sin inferirlo (criterios 5 y 8)', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      renderPage();

      expect(screen.getByText('Renovación automática')).toBeInTheDocument();
      expect(await screen.findByText('Desactivada')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /activar renovación automática/i }),
      ).toBeInTheDocument();
    });

    it('muestra el estado real activado leído del backend (criterio 8)', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: true });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      renderPage();

      expect(await screen.findByText('Activada')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /desactivar renovación automática/i }),
      ).toBeInTheDocument();
    });

    it('activarla exige una confirmación explícita antes de llamar al backend (criterio 6, RN-PAG-07)', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /activar renovación automática/i }),
      );

      const dialog = await screen.findByRole('alertdialog', {
        name: /¿activar la renovación automática\?/i,
      });
      expect(dialog).toHaveTextContent(/no ejecutamos ningún cobro/i);
      expect(updateAutoRenewMock).not.toHaveBeenCalled();
    });

    it('activa la renovación automática, la confirma visiblemente y refresca el estado (criterios 6 y 8)', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      updateAutoRenewMock.mockResolvedValueOnce(undefined);
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: true });
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /activar renovación automática/i }),
      );
      await user.click(await screen.findByRole('button', { name: 'Activar' }));

      expect(updateAutoRenewMock).toHaveBeenCalledWith({ enabled: true });
      expect(
        await screen.findByText('Activaste la renovación automática. Guardamos tu autorización.'),
      ).toBeInTheDocument();
      // Criterio 8: se vuelve a consultar GET /members/me tras el cambio.
      expect(await screen.findByText('Activada')).toBeInTheDocument();
      expect(fetchMemberProfileMock).toHaveBeenCalledTimes(2);
    });

    it('desactiva la renovación automática con confirmación explícita e inmediata (criterio 7)', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: true });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      updateAutoRenewMock.mockResolvedValueOnce(undefined);
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /desactivar renovación automática/i }),
      );

      const dialog = await screen.findByRole('alertdialog', {
        name: /¿desactivar la renovación automática\?/i,
      });
      expect(dialog).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Desactivar' }));

      expect(updateAutoRenewMock).toHaveBeenCalledWith({ enabled: false });
      expect(await screen.findByText('Desactivaste la renovación automática.')).toBeInTheDocument();
      expect(await screen.findByText('Desactivada')).toBeInTheDocument();
    });

    it('cancelar el diálogo no llama al backend ni cambia el estado mostrado', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /activar renovación automática/i }),
      );
      await screen.findByRole('alertdialog');
      await user.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(updateAutoRenewMock).not.toHaveBeenCalled();
      expect(screen.getByText('Desactivada')).toBeInTheDocument();
    });

    it('un error del backend al cambiar la preferencia se muestra sin dejar un estado inconsistente', async () => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, autoRenew: false });
      fetchMembershipPlansMock.mockResolvedValueOnce(BASE_PLANS);
      updateAutoRenewMock.mockRejectedValueOnce(
        new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(
        await screen.findByRole('button', { name: /activar renovación automática/i }),
      );
      await user.click(await screen.findByRole('button', { name: 'Activar' }));

      expect(await screen.findByText('Ocurrió un error interno.')).toBeInTheDocument();
      expect(screen.getByText('Desactivada')).toBeInTheDocument();
    });
  });
});
