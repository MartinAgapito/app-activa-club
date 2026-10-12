import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { PublicLayout } from './PublicLayout';
import { HomePage } from '../pages/public/HomePage';

function renderHome() {
  const router = createMemoryRouter(
    [{ element: <PublicLayout />, children: [{ path: '/', element: <HomePage /> }] }],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('PublicLayout', () => {
  it('ofrece la navegación principal con marca, inicio de sesión y crear cuenta', () => {
    renderHome();

    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(nav).toHaveTextContent('Activa Club');
    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
  });
});

describe('HomePage', () => {
  it('muestra un único h1, las acciones de acceso y tres beneficios', () => {
    renderHome();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: /ya soy socio, activar cuenta/i })).toHaveAttribute(
      'href',
      '/activar-cuenta',
    );
    expect(screen.getByRole('link', { name: /quiero ser socio nuevo/i })).toHaveAttribute(
      'href',
      '/registro',
    );
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});
