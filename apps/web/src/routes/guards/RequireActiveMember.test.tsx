// Bug P1-5 (auditoría de integración Sprint 1): sin este guard, un socio
// PENDING/APPROVED/REJECTED entraba a /socio/* como si estuviera ACTIVE.
// Cubre: PENDING y REJECTED se redirigen y no acceden al área de socio;
// APPROVED también se redirige (RN-ACT-07: falta pagar la primera
// membresía); ACTIVE accede normalmente; estado de carga sin parpadeo de
// contenido protegido; estado de error con reintento.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Member, MemberStatus } from '@activa-club/shared-types';
import { RequireActiveMember } from './RequireActiveMember';
import { ApiRequestError } from '../../lib/api/http-client';

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
  memberStatus: 'ACTIVE',
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

function renderWithStatus() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <RequireActiveMember />,
        children: [{ path: '/socio', element: <p>Contenido de socio</p> }],
      },
      { path: '/cuenta/pendiente-aprobacion', element: <p>Pantalla de solicitud en revisión</p> },
    ],
    { initialEntries: ['/socio'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('RequireActiveMember', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMemberProfileMock.mockReset();
  });

  it('no muestra el contenido protegido mientras verifica la cuenta (sin parpadeo)', () => {
    fetchMemberProfileMock.mockReturnValue(new Promise(() => {}));
    renderWithStatus();

    expect(screen.getByText('Verificando tu cuenta…')).toBeInTheDocument();
    expect(screen.queryByText('Contenido de socio')).not.toBeInTheDocument();
  });

  it.each<MemberStatus>(['PENDING', 'REJECTED', 'APPROVED', 'MIGRATED'])(
    'redirige a /cuenta/pendiente-aprobacion cuando memberStatus es %s',
    async (memberStatus) => {
      fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus });
      renderWithStatus();

      expect(await screen.findByText('Pantalla de solicitud en revisión')).toBeInTheDocument();
      expect(screen.queryByText('Contenido de socio')).not.toBeInTheDocument();
    },
  );

  it('permite el acceso al área de socio cuando memberStatus es ACTIVE', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'ACTIVE' });
    renderWithStatus();

    expect(await screen.findByText('Contenido de socio')).toBeInTheDocument();
  });

  it('muestra un estado de error con opción de reintentar si falla la verificación', async () => {
    fetchMemberProfileMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    renderWithStatus();

    expect(
      await screen.findByRole('heading', { name: /no pudimos verificar tu cuenta/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Contenido de socio')).not.toBeInTheDocument();

    fetchMemberProfileMock.mockResolvedValueOnce({ ...BASE_MEMBER, memberStatus: 'ACTIVE' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => expect(screen.getByText('Contenido de socio')).toBeInTheDocument());
  });
});
