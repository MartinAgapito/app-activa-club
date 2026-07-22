import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { AuthContext, type AuthContextValue, type AuthSession } from '../../auth/AuthContext';
import { CognitoAuthError } from '../../auth/cognito-client';

function renderLoginPage(
  signIn: AuthContextValue['signIn'],
  session: AuthSession = { status: 'anonymous', role: null, memberId: null },
) {
  const value: AuthContextValue = {
    ...session,
    signIn,
    signOut: () => {},
    setSession: () => {},
  };

  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthContext.Provider value={value}>
            <LoginPage />
          </AuthContext.Provider>
        ),
        children: [],
        path: '/login',
      },
      { path: '/socio', element: <p>Dashboard de socio</p> },
      { path: '/admin', element: <p>Dashboard de administrador</p> },
    ],
    { initialEntries: ['/login'] },
  );

  return render(<RouterProvider router={router} />);
}

describe('LoginPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza el formulario de forma accesible', () => {
    renderLoginPage(vi.fn());

    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('valida los campos requeridos antes de intentar iniciar sesión', async () => {
    const signIn = vi.fn();
    const user = userEvent.setup();
    renderLoginPage(signIn);

    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('inicia sesión con credenciales correctas y navega según el rol (criterios 1 y 2)', async () => {
    const signIn = vi
      .fn()
      .mockResolvedValue({ status: 'authenticated', role: 'member', memberId: null });
    const user = userEvent.setup();
    renderLoginPage(signIn);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.type(screen.getByLabelText(/contraseña/i), 'Sup3rSecreta!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(signIn).toHaveBeenCalledWith({ email: 'socio@example.com', password: 'Sup3rSecreta!' });
    expect(await screen.findByText('Dashboard de socio')).toBeInTheDocument();
  });

  it('muestra un mensaje de error genérico con credenciales incorrectas (criterio 3)', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(
        new CognitoAuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.'),
      );
    const user = userEvent.setup();
    renderLoginPage(signIn);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.type(screen.getByLabelText(/contraseña/i), 'incorrecta');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos.');
    // No debe revelar si el correo existe ni distinguir el motivo real.
    expect(screen.queryByText(/no existe/i)).not.toBeInTheDocument();
  });

  it('orienta a activar la cuenta cuando el correo no está confirmado', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(
        new CognitoAuthError('USER_NOT_CONFIRMED', 'Tu cuenta todavía no está activada.'),
      );
    const user = userEvent.setup();
    renderLoginPage(signIn);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.type(screen.getByLabelText(/contraseña/i), 'Sup3rSecreta!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tu cuenta todavía no está activada.',
    );
    expect(screen.getByRole('link', { name: /activar cuenta con dni/i })).toHaveAttribute(
      'href',
      '/activar-cuenta',
    );
    expect(screen.getByRole('link', { name: /verificar correo/i })).toHaveAttribute(
      'href',
      '/verificar-correo',
    );
  });

  it('comunica el bloqueo temporal por intentos fallidos', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValue(
        new CognitoAuthError(
          'TOO_MANY_ATTEMPTS',
          'Se bloqueó el inicio de sesión temporalmente por demasiados intentos fallidos. Intenta de nuevo en unos minutos.',
        ),
      );
    const user = userEvent.setup();
    renderLoginPage(signIn);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.type(screen.getByLabelText(/contraseña/i), 'Sup3rSecreta!');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bloqueó el inicio de sesión/i);
  });

  it('redirige directamente a un usuario que ya tiene sesión activa', () => {
    renderLoginPage(vi.fn(), { status: 'authenticated', role: 'admin', memberId: null });

    expect(screen.getByText('Dashboard de administrador')).toBeInTheDocument();
  });
});
