import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { registerMemberMock } = vi.hoisted(() => ({
  registerMemberMock: vi.fn(),
}));

vi.mock('../../auth/registration-client', () => ({
  registerMember: registerMemberMock,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <RegisterPage />
    </MemoryRouter>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('textbox', { name: /^dni/i }), '10203040');
  await user.type(
    screen.getByRole('textbox', { name: /correo electrónico/i }),
    'nuevo@example.com',
  );
  await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
  await user.type(screen.getByRole('textbox', { name: /nombres/i }), 'Juan');
  await user.type(screen.getByRole('textbox', { name: /apellidos/i }), 'Pérez');
  await user.type(screen.getByRole('textbox', { name: /teléfono/i }), '999000111');
}

describe('RegisterPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    registerMemberMock.mockReset();
  });

  it('renderiza el formulario de forma accesible', () => {
    renderPage();

    expect(screen.getByRole('textbox', { name: /^dni/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /nombres/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /apellidos/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /teléfono/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
  });

  it('valida los campos requeridos antes de registrar (criterio 3)', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa un correo electrónico válido.')).toBeInTheDocument();
    expect(screen.getByText('Debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tus nombres.')).toBeInTheDocument();
    expect(screen.getByText('Ingresa tus apellidos.')).toBeInTheDocument();
    expect(registerMemberMock).not.toHaveBeenCalled();
  });

  it('registra al socio y avisa que queda pendiente de aprobación, sin iniciar sesión (criterio 1 y 6)', async () => {
    registerMemberMock.mockResolvedValueOnce({ memberId: '01J...', memberStatus: 'PENDING' });
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(registerMemberMock).toHaveBeenCalledWith({
      dni: '10203040',
      email: 'nuevo@example.com',
      password: 'ClaveSegura1',
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '999000111',
    });
    expect(await screen.findByRole('heading', { name: /solicitud enviada/i })).toBeInTheDocument();
    expect(screen.getByText(/quedó pendiente de aprobación administrativa/i)).toBeInTheDocument();
    expect(screen.getByText(/deberás pagar tu primera membresía/i)).toBeInTheDocument();
    // No debe iniciar sesión automáticamente: solo ofrece el enlace a /login.
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: /crear cuenta/i })).not.toBeInTheDocument();
  });

  it('permite registrarse sin teléfono (campo opcional)', async () => {
    registerMemberMock.mockResolvedValueOnce({ memberId: '01J...', memberStatus: 'PENDING' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^dni/i }), '10203040');
    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'nuevo@example.com',
    );
    await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
    await user.type(screen.getByRole('textbox', { name: /nombres/i }), 'Juan');
    await user.type(screen.getByRole('textbox', { name: /apellidos/i }), 'Pérez');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('heading', { name: /solicitud enviada/i })).toBeInTheDocument();
    const [request] = registerMemberMock.mock.calls[0] as [Record<string, unknown>];
    expect(request).not.toHaveProperty('phone');
  });

  it('muestra un mensaje específico cuando el DNI ya está registrado, sin enlace roto (criterio 2)', async () => {
    registerMemberMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'DNI_ALREADY_USED', 'El DNI ya está registrado.'),
    );
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText('Este DNI ya está registrado.')).toBeInTheDocument();
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((alert) =>
        /activa tu cuenta con tu dni en lugar de registrarte de nuevo/i.test(
          alert.textContent ?? '',
        ),
      ),
    ).toBe(true);
    expect(screen.queryByRole('link', { name: /activar cuenta/i })).not.toBeInTheDocument();
  });

  it('muestra un mensaje específico cuando el correo ya está registrado, con enlaces a login (criterio 2)', async () => {
    registerMemberMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'EMAIL_ALREADY_USED', 'El correo ya está registrado.'),
    );
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText('Este correo ya está registrado.')).toBeInTheDocument();
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((alert) => /ya tiene una cuenta asociada/i.test(alert.textContent ?? '')),
    ).toBe(true);
    expect(screen.getByRole('link', { name: /^iniciar sesión$/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: /recuperar contraseña/i })).toHaveAttribute(
      'href',
      '/recuperar-password',
    );
  });

  it('muestra los errores de validación del backend campo a campo (criterio 3)', async () => {
    registerMemberMock.mockRejectedValueOnce(
      new ApiRequestError(400, 'VALIDATION_ERROR', 'Datos inválidos.', [
        { field: 'dni', issue: 'El DNI no es válido.' },
        { field: 'phone', issue: 'El teléfono no es válido.' },
      ]),
    );
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByText('El DNI no es válido.')).toBeInTheDocument();
    expect(screen.getByText('El teléfono no es válido.')).toBeInTheDocument();
  });

  it('comunica un error genérico ante una falla inesperada', async () => {
    registerMemberMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo completar el registro/i);
  });
});
