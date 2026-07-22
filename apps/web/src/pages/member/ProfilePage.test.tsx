import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Member } from '@activa-club/shared-types';
import { ProfilePage } from './ProfilePage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchMemberProfileMock, updateMemberProfileMock } = vi.hoisted(() => ({
  fetchMemberProfileMock: vi.fn(),
  updateMemberProfileMock: vi.fn(),
}));

vi.mock('../../members/profile-client', () => ({
  fetchMemberProfile: fetchMemberProfileMock,
  updateMemberProfile: updateMemberProfileMock,
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage />
    </QueryClientProvider>,
  );
}

describe('ProfilePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    fetchMemberProfileMock.mockReset();
    updateMemberProfileMock.mockReset();
  });

  it('muestra un estado de carga mientras obtiene el perfil', () => {
    fetchMemberProfileMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByText('Cargando tu perfil…')).toBeInTheDocument();
  });

  it('muestra el perfil del socio con los estados traducidos a texto claro (criterio 1)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    renderPage();

    expect(await screen.findByRole('heading', { name: /maría quispe/i })).toBeInTheDocument();
    expect(screen.getByText('45678912')).toBeInTheDocument();
    expect(screen.getByText('maria.quispe@example.com')).toBeInTheDocument();
    // Nunca el código interno crudo (ACTIVE), sino el texto traducido.
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Al día')).toBeInTheDocument();
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /teléfono/i })).toHaveValue('999111222');
  });

  it('muestra el perfil de un socio MIGRATED/PENDING sin bloquear la vista (caso alternativo)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce({
      ...BASE_MEMBER,
      memberStatus: 'PENDING',
      membershipStatus: 'NONE',
      phone: null,
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: /maría quispe/i })).toBeInTheDocument();
    expect(screen.getByText('Solicitud pendiente de aprobación')).toBeInTheDocument();
    expect(screen.getByText('Sin membresía activa')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /teléfono/i })).toHaveValue('');
  });

  it('muestra un estado de error si falla la carga inicial, con opción de reintentar', async () => {
    fetchMemberProfileMock.mockRejectedValueOnce(
      new ApiRequestError(500, 'INTERNAL_ERROR', 'Ocurrió un error interno.'),
    );
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /no pudimos cargar tu perfil/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Ocurrió un error interno.')).toBeInTheDocument();

    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));

    expect(await screen.findByRole('heading', { name: /maría quispe/i })).toBeInTheDocument();
  });

  it('actualiza el teléfono y confirma visualmente el guardado (criterio 2)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    const updated: Member = {
      ...BASE_MEMBER,
      phone: '999888777',
      updatedAt: '2026-07-21T00:00:00Z',
    };
    updateMemberProfileMock.mockResolvedValueOnce(updated);
    const user = userEvent.setup();
    renderPage();

    const phoneInput = await screen.findByRole('textbox', { name: /teléfono/i });
    await user.clear(phoneInput);
    await user.type(phoneInput, '999888777');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(updateMemberProfileMock).toHaveBeenCalled());
    expect(updateMemberProfileMock.mock.calls[0]?.[0]).toEqual({ phone: '999888777' });
    expect(await screen.findByText('Tu teléfono se actualizó correctamente.')).toBeInTheDocument();
  });

  it('rechaza un teléfono con formato inválido antes de llamar al backend', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    const user = userEvent.setup();
    renderPage();

    const phoneInput = await screen.findByRole('textbox', { name: /teléfono/i });
    await user.clear(phoneInput);
    await user.type(phoneInput, '123');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('Teléfono inválido.')).toBeInTheDocument();
    expect(updateMemberProfileMock).not.toHaveBeenCalled();
  });

  it('muestra el error de validación del backend en el campo teléfono (criterio 4)', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    updateMemberProfileMock.mockRejectedValueOnce(
      new ApiRequestError(400, 'VALIDATION_ERROR', 'Datos inválidos.', [
        { field: 'phone', issue: 'El teléfono no es válido.' },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    const phoneInput = await screen.findByRole('textbox', { name: /teléfono/i });
    await user.clear(phoneInput);
    await user.type(phoneInput, '999888777');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByText('El teléfono no es válido.')).toBeInTheDocument();
  });

  it('muestra un error genérico si falla el guardado por un motivo inesperado', async () => {
    fetchMemberProfileMock.mockResolvedValueOnce(BASE_MEMBER);
    updateMemberProfileMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderPage();

    const phoneInput = await screen.findByRole('textbox', { name: /teléfono/i });
    await user.clear(phoneInput);
    await user.type(phoneInput, '999888777');
    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo guardar el teléfono/i);
  });
});
