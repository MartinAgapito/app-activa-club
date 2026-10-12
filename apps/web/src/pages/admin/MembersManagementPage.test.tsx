import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Member, MemberSummary, Paginated } from '@activa-club/shared-types';
import { MembersManagementPage } from './MembersManagementPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { fetchMembersByStatusMock, fetchMemberDetailMock, lookupMemberByDniMock } = vi.hoisted(
  () => ({
    fetchMembersByStatusMock: vi.fn(),
    fetchMemberDetailMock: vi.fn(),
    lookupMemberByDniMock: vi.fn(),
  }),
);

vi.mock('../../admin/members/members-client', () => ({
  MEMBERS_PAGE_SIZE: 20,
  fetchMembersByStatus: fetchMembersByStatusMock,
}));
vi.mock('../../admin/pending-members-client', () => ({
  fetchMemberDetail: fetchMemberDetailMock,
}));
vi.mock('../../reservations/reservations-client', () => ({
  lookupMemberByDni: lookupMemberByDniMock,
}));

const ACTIVE_SUMMARY: MemberSummary = {
  memberId: 'member-a',
  dni: '10203040',
  firstName: 'Juan',
  lastName: 'Pérez',
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  membershipStatus: 'DEBT',
  createdAt: '2026-07-01T00:00:00Z',
};

const MIGRATED_SUMMARY: MemberSummary = {
  memberId: 'member-m',
  dni: '50607080',
  firstName: 'Ana',
  lastName: 'Gómez',
  origin: 'MIGRATED',
  memberStatus: 'MIGRATED',
  membershipStatus: 'EXPIRING_SOON',
  createdAt: '2026-06-01T00:00:00Z',
};

const DETAIL_A: Member = {
  memberId: 'member-a',
  legacyId: null,
  dni: '10203040',
  email: 'juan.perez@example.com',
  firstName: 'Juan',
  lastName: 'Pérez',
  phone: '999111222',
  origin: 'NEW',
  memberStatus: 'ACTIVE',
  cognitoSub: 'sub-a',
  rejectionReason: null,
  membershipType: 'MONTHLY',
  membershipStatus: 'DEBT',
  membershipStartedAt: '2026-06-01T00:00:00Z',
  membershipEndsAt: '2020-01-15T12:00:00Z',
  outstandingBalance: 12000,
  autoRenew: true,
  createdAt: '2026-07-01T00:00:00Z',
  updatedAt: '2026-07-01T00:00:00Z',
};

function page(items: MemberSummary[], nextCursor: string | null = null): Paginated<MemberSummary> {
  return { items, nextCursor };
}

function LocationProbe() {
  return <p data-testid="location-search">{useLocation().search}</p>;
}

function renderPage(initialEntry = '/admin/socios') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <MembersManagementPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('MembersManagementPage', () => {
  afterEach(() => {
    fetchMembersByStatusMock.mockReset();
    fetchMemberDetailMock.mockReset();
    lookupMemberByDniMock.mockReset();
  });

  it('muestra el título, las pestañas por estado y el estado de carga', () => {
    fetchMembersByStatusMock.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByRole('heading', { name: 'Socios' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activos', selected: true })).toBeInTheDocument();
    for (const name of ['Migrados', 'Aprobados', 'Pendientes', 'Rechazados']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.getByText('Cargando socios…')).toBeInTheDocument();
  });

  it('lista los socios activos con nombre, DNI, origen, membresía y fecha de alta', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([ACTIVE_SUMMARY]));
    renderPage();

    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
    expect(fetchMembersByStatusMock).toHaveBeenCalledWith('ACTIVE', null);
    for (const header of ['Nombre', 'DNI', 'Origen', 'Membresía', 'Fecha de alta']) {
      expect(screen.getByRole('columnheader', { name: header })).toBeInTheDocument();
    }
    expect(screen.getByText('10203040')).toBeInTheDocument();
    expect(screen.getByText('Nuevo')).toBeInTheDocument();
    // Etiqueta legible, nunca el código crudo.
    expect(screen.getByText('Con deuda pendiente')).toBeInTheDocument();
    expect(screen.queryByText('DEBT')).not.toBeInTheDocument();
    // El correo solo aparece en el detalle.
    expect(screen.queryByText('juan.perez@example.com')).not.toBeInTheDocument();
  });

  it('cambia de pestaña, guarda ?tab= y consulta el estado correspondiente', async () => {
    fetchMembersByStatusMock.mockImplementation((status: string) =>
      Promise.resolve(page(status === 'MIGRATED' ? [MIGRATED_SUMMARY] : [ACTIVE_SUMMARY])),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Pérez');

    await user.click(screen.getByRole('tab', { name: 'Migrados' }));

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(fetchMembersByStatusMock).toHaveBeenCalledWith('MIGRATED', null);
    expect(screen.getByTestId('location-search')).toHaveTextContent('?tab=migrados');
    expect(screen.getByText('Por vencer')).toBeInTheDocument();
  });

  it('abre la pestaña indicada en la URL', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([]));
    renderPage('/admin/socios?tab=rechazados');

    expect(await screen.findByText('No hay solicitudes rechazadas')).toBeInTheDocument();
    expect(fetchMembersByStatusMock).toHaveBeenCalledWith('REJECTED', null);
    expect(screen.getByRole('tab', { name: 'Rechazados', selected: true })).toBeInTheDocument();
  });

  it('muestra un estado vacío por estado', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([]));
    renderPage();

    expect(await screen.findByText('No hay socios activos')).toBeInTheDocument();
  });

  it('muestra error con reintento si falla la carga de la lista', async () => {
    fetchMembersByStatusMock
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'Falló el servidor.'))
      .mockResolvedValueOnce(page([ACTIVE_SUMMARY]));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('No pudimos cargar los socios')).toBeInTheDocument();
    expect(screen.getByText('Falló el servidor.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
  });

  it('carga más socios con el cursor de la página anterior', async () => {
    fetchMembersByStatusMock
      .mockResolvedValueOnce(page([ACTIVE_SUMMARY], 'cursor-2'))
      .mockResolvedValueOnce(page([{ ...MIGRATED_SUMMARY, memberStatus: 'ACTIVE' }]));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Pérez');

    await user.click(screen.getByRole('button', { name: 'Cargar más' }));

    expect(await screen.findByText('Ana Gómez')).toBeInTheDocument();
    expect(fetchMembersByStatusMock).toHaveBeenLastCalledWith('ACTIVE', 'cursor-2');
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('abre el detalle de solo lectura al hacer clic en una fila', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([ACTIVE_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(DETAIL_A);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));

    const panel = await screen.findByRole('dialog', { name: 'Juan Pérez' });
    expect(await within(panel).findByText('juan.perez@example.com')).toBeInTheDocument();
    expect(fetchMemberDetailMock).toHaveBeenCalledWith('member-a');
    expect(within(panel).getByText('999111222')).toBeInTheDocument();
    expect(within(panel).getByText('Activo')).toBeInTheDocument();
    expect(within(panel).getByText('Mensual')).toBeInTheDocument();
    expect(within(panel).getByText('Con deuda pendiente')).toBeInTheDocument();
    expect(within(panel).getByText(/120\.00/)).toBeInTheDocument();
    expect(within(panel).getByText('Autorizada')).toBeInTheDocument();
    expect(within(panel).getByText(/Venció hace \d+ días/)).toBeInTheDocument();
    // Solo lectura: sin acciones de edición ni de decisión.
    expect(within(panel).queryByRole('button', { name: /editar|suspender|aprobar/i })).toBeNull();
    expect(screen.getByTestId('location-search')).toHaveTextContent('?socio=member-a');
  });

  it('abre el detalle con Enter sobre la fila enfocada y lo cierra con Escape', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([ACTIVE_SUMMARY]));
    fetchMemberDetailMock.mockResolvedValueOnce(DETAIL_A);
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Pérez');

    screen.getByRole('row', { name: /Ver el detalle de Juan Pérez/ }).focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('dialog', { name: 'Juan Pérez' });
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location-search')).not.toHaveTextContent('socio=');
  });

  it('muestra error con reintento si falla el detalle', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([ACTIVE_SUMMARY]));
    fetchMemberDetailMock
      .mockRejectedValueOnce(new ApiRequestError(500, 'INTERNAL_ERROR', 'Falló el detalle.'))
      .mockResolvedValueOnce(DETAIL_A);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Juan Pérez'));
    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('No pudimos cargar este socio')).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Reintentar' }));
    expect(await within(panel).findByText('juan.perez@example.com')).toBeInTheDocument();
  });

  it('muestra el identificador legado de un socio migrado y enlaza a solicitudes si está pendiente', async () => {
    fetchMembersByStatusMock.mockResolvedValueOnce(page([]));
    fetchMemberDetailMock.mockResolvedValueOnce({
      ...DETAIL_A,
      origin: 'MIGRATED',
      legacyId: 'LEG-0042',
      memberStatus: 'PENDING',
      membershipType: null,
      membershipStatus: 'NONE',
      membershipEndsAt: null,
      outstandingBalance: 0,
      autoRenew: false,
    } satisfies Member);
    renderPage('/admin/socios?socio=member-a');

    const panel = await screen.findByRole('dialog');
    expect(await within(panel).findByText('LEG-0042')).toBeInTheDocument();
    expect(within(panel).getByText('No autorizada')).toBeInTheDocument();
    expect(within(panel).getByText('Sin vencimiento')).toBeInTheDocument();
    expect(
      within(panel).getByRole('link', { name: 'Ir a solicitudes pendientes' }),
    ).toHaveAttribute('href', '/admin/solicitudes');
  });

  describe('búsqueda por DNI', () => {
    it('valida que el DNI tenga 8 dígitos y no llama a la API', async () => {
      fetchMembersByStatusMock.mockResolvedValue(page([]));
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Buscar por DNI'), '123');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
      expect(lookupMemberByDniMock).not.toHaveBeenCalled();
    });

    it('abre el detalle del socio resuelto', async () => {
      fetchMembersByStatusMock.mockResolvedValue(page([]));
      lookupMemberByDniMock.mockResolvedValueOnce({
        memberId: 'member-a',
        firstName: 'Juan',
        lastName: 'Pérez',
      });
      fetchMemberDetailMock.mockResolvedValueOnce(DETAIL_A);
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Buscar por DNI'), '10203040');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      const panel = await screen.findByRole('dialog', { name: 'Juan Pérez' });
      expect(await within(panel).findByText('juan.perez@example.com')).toBeInTheDocument();
      expect(lookupMemberByDniMock).toHaveBeenCalledWith('10203040');
    });

    it('indica que no se encontró al socio y sugiere pendientes o rechazados', async () => {
      fetchMembersByStatusMock.mockResolvedValue(page([]));
      lookupMemberByDniMock.mockRejectedValueOnce(
        new ApiRequestError(404, 'DNI_NOT_FOUND', 'No existe.'),
      );
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Buscar por DNI'), '99999999');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('No encontramos un socio con ese DNI');
      expect(alert).toHaveTextContent('Pendientes');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('muestra el mensaje del servidor ante otro error de la búsqueda', async () => {
      fetchMembersByStatusMock.mockResolvedValue(page([]));
      lookupMemberByDniMock.mockRejectedValueOnce(
        new ApiRequestError(500, 'INTERNAL_ERROR', 'Servicio no disponible.'),
      );
      const user = userEvent.setup();
      renderPage();

      await user.type(screen.getByLabelText('Buscar por DNI'), '10203040');
      await user.click(screen.getByRole('button', { name: 'Buscar' }));

      expect(await screen.findByText('Servicio no disponible.')).toBeInTheDocument();
    });
  });
});
