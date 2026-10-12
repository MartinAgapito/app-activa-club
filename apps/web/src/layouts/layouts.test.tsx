// US-068: estructura por rol (barra lateral, cabecera, menú móvil, skip link).
// jsdom no aplica CSS, por lo que la barra lateral y el botón de menú existen a
// la vez; lo que se prueba es la semántica (roles, nombres, aria-current,
// foco), no la visibilidad por breakpoint.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Member } from '@activa-club/shared-types';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import { MemberLayout } from './MemberLayout';
import { AdminLayout } from './AdminLayout';
import { PublicLayout } from './PublicLayout';

const { fetchMemberProfileMock } = vi.hoisted(() => ({ fetchMemberProfileMock: vi.fn() }));

vi.mock('../members/profile-client', () => ({ fetchMemberProfile: fetchMemberProfileMock }));

const MEMBER = { firstName: 'María', lastName: 'Quispe' } as Member;

function session(
  role: 'member' | 'admin',
  signOut = vi.fn(),
  email: string | null = null,
): AuthContextValue {
  return {
    status: 'authenticated',
    role,
    memberId: null,
    email,
    signIn: () => Promise.reject(new Error('no usado')),
    setSession: () => {},
    signOut,
  };
}

function renderLayout(
  kind: 'member' | 'admin',
  path: string,
  signOut = vi.fn(),
  email: string | null = null,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const isMember = kind === 'member';
  const router = createMemoryRouter(
    [
      {
        element: isMember ? <MemberLayout /> : <AdminLayout />,
        children: [
          { path: '/socio', element: <h1>Inicio socio</h1> },
          { path: '/socio/reservas', element: <h1>Reservar</h1> },
          { path: '/socio/reservas/mias', element: <h1>Mis reservas</h1> },
          { path: '/socio/perfil', element: <h1>Perfil</h1> },
          { path: '/admin', element: <h1>Inicio admin</h1> },
          { path: '/admin/socios', element: <h1>Socios</h1> },
          { path: '/admin/membresias', element: <h1>Pagos admin</h1> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(
    <AuthContext.Provider value={session(kind, signOut, email)}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AuthContext.Provider>,
  );
  return { router, signOut };
}

afterEach(() => {
  fetchMemberProfileMock.mockReset();
});

describe('MemberLayout', () => {
  it('muestra la navegación del socio con icono-texto y sin enlaces de administración', () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    renderLayout('member', '/socio');

    const nav = screen.getByRole('navigation', { name: 'Navegación de socio' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual([
      'Inicio',
      'Reservar',
      'Mis reservas',
      'Membresía',
      'Pagos',
      'Notificaciones',
      'Perfil',
    ]);
    expect(screen.queryByRole('link', { name: /solicitudes de socios/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Analítica' })).not.toBeInTheDocument();
  });

  it('marca solo el enlace de la sección actual con aria-current="page"', () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    renderLayout('member', '/socio/reservas/mias');

    const nav = screen.getByRole('navigation', { name: 'Navegación de socio' });
    expect(within(nav).getByRole('link', { name: 'Mis reservas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Reservar' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('section-title')).toHaveTextContent('Mis reservas');
  });

  it('muestra el nombre de pila y el rol; usa "Socio" si falla la consulta', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    renderLayout('member', '/socio');
    expect(await screen.findByRole('button', { name: 'Menú de usuario: María' })).toBeVisible();
  });

  it('usa "Socio" como nombre si GET /members/me falla y la navegación sigue funcionando', async () => {
    fetchMemberProfileMock.mockRejectedValue(new Error('fallo'));
    renderLayout('member', '/socio');

    expect(await screen.findByRole('button', { name: 'Menú de usuario: Socio' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Pagos' })).toBeInTheDocument();
  });

  it('renderiza el contenido en un <main> con id y el skip link lo enfoca', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    const user = userEvent.setup();
    renderLayout('member', '/socio');

    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'contenido-principal');
    expect(within(main).getByRole('heading', { name: 'Inicio socio' })).toBeInTheDocument();

    await user.tab();
    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(main).toHaveFocus();
  });

  it('abre el menú móvil en un panel con foco atrapado y lo cierra al elegir un enlace', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    const user = userEvent.setup();
    const { router } = renderLayout('member', '/socio');

    await user.click(screen.getByRole('button', { name: 'Abrir menú' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activa Club' });
    expect(dialog).toHaveAttribute('data-drawer-side', 'left');
    const nav = within(dialog).getByRole('navigation', { name: 'Navegación de socio' });

    await user.click(within(nav).getByRole('link', { name: 'Perfil' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe('/socio/perfil');
  });

  it('cierra el menú móvil con Escape y devuelve el foco al botón', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    const user = userEvent.setup();
    renderLayout('member', '/socio');

    const opener = screen.getByRole('button', { name: 'Abrir menú' });
    await user.click(opener);
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('el menú de usuario ofrece "Mi perfil" y cierra la sesión', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    const user = userEvent.setup();
    const { signOut } = renderLayout('member', '/socio');

    await user.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(screen.getByRole('link', { name: 'Mi perfil' })).toHaveAttribute(
      'href',
      '/socio/perfil',
    );
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('cierra el menú de usuario con Escape', async () => {
    fetchMemberProfileMock.mockResolvedValue(MEMBER);
    const user = userEvent.setup();
    renderLayout('member', '/socio');

    const trigger = screen.getByRole('button', { name: /menú de usuario/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();
  });
});

describe('AdminLayout', () => {
  it('muestra el correo de la sesión en el menú de usuario', () => {
    renderLayout('admin', '/admin', vi.fn(), 'admin@activa.club');
    expect(
      screen.getByRole('button', { name: 'Menú de usuario: admin@activa.club' }),
    ).toBeInTheDocument();
  });

  it('usa "Administrador" cuando la sesión no trae correo ni nombre', () => {
    renderLayout('admin', '/admin');
    expect(
      screen.getByRole('button', { name: 'Menú de usuario: Administrador' }),
    ).toBeInTheDocument();
  });

  it('muestra la navegación del administrador y no la del socio', () => {
    renderLayout('admin', '/admin');

    const nav = screen.getByRole('navigation', { name: 'Navegación de administración' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual([
      'Inicio',
      'Solicitudes de socios',
      'Reservas',
      'Recursos',
      'Socios',
      'Pagos',
      'Notificaciones',
      'Analítica',
    ]);
    expect(screen.queryByRole('link', { name: 'Mis reservas' })).not.toBeInTheDocument();
    expect(fetchMemberProfileMock).not.toHaveBeenCalled();
  });

  it('resalta el enlace activo y el menú de usuario no ofrece "Mi perfil"', async () => {
    const user = userEvent.setup();
    const { signOut } = renderLayout('admin', '/admin/socios');

    const nav = screen.getByRole('navigation', { name: 'Navegación de administración' });
    expect(within(nav).getByRole('link', { name: 'Socios' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');

    await user.click(screen.getByRole('button', { name: /menú de usuario/i }));
    expect(screen.queryByRole('link', { name: 'Mi perfil' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('"Pagos" lleva a /admin/membresias y conserva la ruta existente', () => {
    renderLayout('admin', '/admin/membresias');

    const nav = screen.getByRole('navigation', { name: 'Navegación de administración' });
    expect(within(nav).getByRole('link', { name: 'Pagos' })).toHaveAttribute(
      'href',
      '/admin/membresias',
    );
    expect(within(nav).getByRole('link', { name: 'Pagos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

describe('PublicLayout', () => {
  it('incluye el skip link como primer elemento enfocable y un <main> destino', async () => {
    const user = userEvent.setup();
    const router = createMemoryRouter(
      [{ element: <PublicLayout />, children: [{ path: '/', element: <h1>Bienvenida</h1> }] }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
