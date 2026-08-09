// US-020 — consultar los planes de membresía disponibles.
// Cubre: estados de carga y error (con reintento) de cada sección de forma
// independiente (criterio 5 — no bloquear la consulta de planes), el
// renderizado de los dos planes con precio formateado en soles y duración
// (criterios 1 y 4), el estado de la membresía vigente del socio (criterio
// 5) y que `allowsInstallments: false` no ofrezca la opción de facilidades
// de pago (caso alternativo).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Member, MembershipPlan } from '@activa-club/shared-types';
import { MembershipPage } from './MembershipPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchMemberProfileMock, fetchMembershipPlansMock } = vi.hoisted(() => ({
  fetchMemberProfileMock: vi.fn(),
  fetchMembershipPlansMock: vi.fn(),
}));

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: fetchMemberProfileMock,
}));

vi.mock('../../members/plans-client', () => ({
  fetchMembershipPlans: fetchMembershipPlansMock,
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
  return render(
    <QueryClientProvider client={queryClient}>
      <MembershipPage />
    </QueryClientProvider>,
  );
}

describe('MembershipPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMemberProfileMock.mockReset();
    fetchMembershipPlansMock.mockReset();
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
});
