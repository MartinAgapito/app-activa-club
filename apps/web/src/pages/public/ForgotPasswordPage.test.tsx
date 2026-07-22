import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { CognitoAuthError } from '../../auth/cognito-client';

const { requestPasswordResetMock, confirmPasswordResetMock } = vi.hoisted(() => ({
  requestPasswordResetMock: vi.fn(),
  confirmPasswordResetMock: vi.fn(),
}));

vi.mock('../../auth/cognito-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../auth/cognito-client')>();
  return {
    ...actual,
    requestPasswordReset: requestPasswordResetMock,
    confirmPasswordReset: confirmPasswordResetMock,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>,
  );
}

async function goToConfirmStep(user: ReturnType<typeof userEvent.setup>) {
  requestPasswordResetMock.mockResolvedValueOnce(undefined);
  await user.type(
    screen.getByRole('textbox', { name: /correo electrónico/i }),
    'socio@example.com',
  );
  await user.click(screen.getByRole('button', { name: /enviar código/i }));
  await screen.findByRole('heading', { name: /confirmar código/i });
}

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    requestPasswordResetMock.mockReset();
    confirmPasswordResetMock.mockReset();
  });

  it('renderiza el formulario de solicitud de forma accesible', () => {
    renderPage();

    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar código/i })).toBeInTheDocument();
  });

  it('valida el correo requerido antes de solicitar el código', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeInTheDocument();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('solicita el código y muestra el mismo mensaje neutro exista o no la cuenta (criterio 1 y 2)', async () => {
    requestPasswordResetMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(requestPasswordResetMock).toHaveBeenCalledWith('socio@example.com');
    expect(await screen.findByRole('status')).toHaveTextContent(
      /si el correo está registrado en activa club/i,
    );
  });

  it('comunica el límite de solicitudes alcanzado al pedir el código', async () => {
    requestPasswordResetMock.mockRejectedValueOnce(
      new CognitoAuthError(
        'TOO_MANY_ATTEMPTS',
        'Alcanzaste el límite de solicitudes de recuperación. Intenta de nuevo en unos minutos.',
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'socio@example.com',
    );
    await user.click(screen.getByRole('button', { name: /enviar código/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/límite de solicitudes/i);
  });

  it('valida el código y la política de contraseña antes de confirmar', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfirmStep(user);

    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    expect(
      await screen.findByText('Ingresa el código que recibiste por correo.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(confirmPasswordResetMock).not.toHaveBeenCalled();
  });

  it('confirma el código y la nueva contraseña, y permite iniciar sesión (criterio 3)', async () => {
    confirmPasswordResetMock.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderPage();
    await goToConfirmStep(user);

    await user.type(screen.getByRole('textbox', { name: /código de verificación/i }), '123456');
    await user.type(screen.getByLabelText(/nueva contraseña/i), 'NuevaClave1');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    expect(confirmPasswordResetMock).toHaveBeenCalledWith(
      'socio@example.com',
      '123456',
      'NuevaClave1',
    );
    expect(
      await screen.findByRole('heading', { name: /contraseña actualizada/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login');
  });

  it('muestra un código inválido/vencido con opción de reenviar (criterio 4)', async () => {
    confirmPasswordResetMock.mockRejectedValueOnce(
      new CognitoAuthError(
        'INVALID_RESET_CODE',
        'El código ingresado no es válido o venció. Solicita uno nuevo e inténtalo de nuevo.',
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await goToConfirmStep(user);

    await user.type(screen.getByRole('textbox', { name: /código de verificación/i }), '000000');
    await user.type(screen.getByLabelText(/nueva contraseña/i), 'NuevaClave1');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no es válido o venció/i);

    requestPasswordResetMock.mockResolvedValueOnce(undefined);
    await user.click(screen.getByRole('button', { name: /reenviar código/i }));

    expect(requestPasswordResetMock).toHaveBeenCalledWith('socio@example.com');
    expect(await screen.findByText(/te enviamos un nuevo código/i)).toBeInTheDocument();
  });

  it('muestra el detalle de la política cuando la nueva contraseña no la cumple (criterio 5)', async () => {
    confirmPasswordResetMock.mockRejectedValueOnce(
      new CognitoAuthError(
        'WEAK_PASSWORD',
        'Password does not conform to policy: Password must have uppercase characters',
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await goToConfirmStep(user);

    await user.type(screen.getByRole('textbox', { name: /código de verificación/i }), '123456');
    await user.type(screen.getByLabelText(/nueva contraseña/i), 'NuevaClave1');
    await user.click(screen.getByRole('button', { name: /actualizar contraseña/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/does not conform to policy/i);
    expect(screen.getByText('Al menos una letra mayúscula.')).toBeInTheDocument();
  });

  it('permite volver a usar otro correo desde el paso de confirmación', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToConfirmStep(user);

    await user.click(screen.getByRole('button', { name: /usar otro correo/i }));

    expect(
      await screen.findByRole('heading', { name: /recuperar contraseña/i }),
    ).toBeInTheDocument();
  });
});
