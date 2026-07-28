// RN-ACT-06/07 — alcanzada desde RequireActiveMember cuando memberStatus
// !== 'ACTIVE'. Cubre el mensaje correcto por estado (PENDING/APPROVED/
// REJECTED), el estado de carga y el redireccionamiento de vuelta a /socio
// si la cuenta ya está ACTIVE (evita un callejón sin salida si el socio
// llega aquí directamente después de activarse).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Member } from '@activa-club/shared-types';
import { PendingApprovalPage } from './PendingApprovalPage';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';

const { fetchMemberProfileMock } = vi.hoisted(() => ({
  fetchMemberProfileMock: vi.fn(),
}));

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: fetchMemberProfileMock,
}));

const BASE_MEMBER: Member = {
  memberId: '01J...',
  legacyId: null,
  dni: '45678912',
  email: 'maria.quispe@example.com',
  firstName: 'María',
  lastName: 'Quispe',
  phone: '999111222',
  origin: 'NEW',
  memberStatus: 'PENDING',
  cognitoSub: 'sub-123',
  rejectionReason: null,
  membershipType: null,
  membershipStatus: 'NONE',
  membershipStartedAt: null,
  membershipEndsAt: null,
  outstandingBalance: 0,
  autoRenew: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const AUTH_VALUE: AuthContextValue = {
  status: 'authenticated',
  role: 'member',
  memberId: '01J...',
  signIn: () => Promise.reject(new Error('no usado en este test')),
  setSession: () => {},
  signOut: vi.fn(),
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/cuenta/pendiente-aprobacion', element: <PendingApprovalPage /> },
      { path: '/socio', element: <p>Dashboard de socio</p> },
    ],
    { initialEntries: ['/cuenta/pendiente-aprobacion'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={AUTH_VALUE}>
        <RouterProvider router={router} />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('PendingApprovalPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMemberProfileMock.mockReset();
  });

  it('muestra un estado de carga mientras verifica la cuenta', () => {
    fetchMemberProfileMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Verificando tu cuenta…')).toBeInTheDocument();
  });

  it('muestra el mensaje de solicitud en revisión para memberStatus PENDING', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'PENDING' });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /tu solicitud está siendo evaluada/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Solicitud pendiente de aprobación')).toBeInTheDocument();
  });

  it('muestra el mensaje de aprobado pendiente de pago para memberStatus APPROVED', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'APPROVED' });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /tu solicitud fue aprobada/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/pagar tu primera membresía/i)).toBeInTheDocument();
  });

  it('muestra el motivo del rechazo para memberStatus REJECTED', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({
      ...BASE_MEMBER,
      memberStatus: 'REJECTED',
      rejectionReason: 'Documentación incompleta',
    });
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /tu solicitud fue rechazada/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/documentación incompleta/i)).toBeInTheDocument();
  });

  it('redirige a /socio si memberStatus ya es ACTIVE', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'ACTIVE' });
    renderPage();

    expect(await screen.findByText('Dashboard de socio')).toBeInTheDocument();
  });

  it('permite cerrar sesión desde la pantalla de espera', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'PENDING' });
    renderPage();

    const signOutButton = await screen.findByRole('button', { name: /cerrar sesión/i });
    signOutButton.click();

    expect(AUTH_VALUE.signOut).toHaveBeenCalled();
  });
});
