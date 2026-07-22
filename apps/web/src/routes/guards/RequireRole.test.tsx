import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { ReactElement } from 'react';
import { RequireRole } from './RequireRole';
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext';

function renderWithSession(session: AuthContextValue, guarded: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthContext.Provider value={session}>
            <RequireRole allow={['member']} />
          </AuthContext.Provider>
        ),
        children: [{ path: '/socio', element: guarded }],
      },
      { path: '/login', element: <p>Pantalla de login</p> },
      { path: '/403', element: <p>Sin permisos</p> },
    ],
    { initialEntries: ['/socio'] },
  );

  return render(<RouterProvider router={router} />);
}

describe('RequireRole', () => {
  it('redirige a /login cuando la sesión es anónima', () => {
    renderWithSession(
      {
        status: 'anonymous',
        role: null,
        memberId: null,
        signIn: () => Promise.reject(new Error('no usado en este test')),
        setSession: () => {},
        signOut: () => {},
      },
      <p>Contenido de socio</p>,
    );

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });

  it('redirige a /403 cuando el rol autenticado no está permitido', () => {
    renderWithSession(
      {
        status: 'authenticated',
        role: 'admin',
        memberId: null,
        signIn: () => Promise.reject(new Error('no usado en este test')),
        setSession: () => {},
        signOut: () => {},
      },
      <p>Contenido de socio</p>,
    );

    expect(screen.getByText('Sin permisos')).toBeInTheDocument();
  });

  it('renderiza el contenido cuando el rol autenticado está permitido', () => {
    renderWithSession(
      {
        status: 'authenticated',
        role: 'member',
        memberId: '01J-test',
        signIn: () => Promise.reject(new Error('no usado en este test')),
        setSession: () => {},
        signOut: () => {},
      },
      <p>Contenido de socio</p>,
    );

    expect(screen.getByText('Contenido de socio')).toBeInTheDocument();
  });
});
