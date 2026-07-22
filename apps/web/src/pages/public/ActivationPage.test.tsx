import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ActivationPage } from './ActivationPage';
import { ApiRequestError } from '../../lib/api/http-client';

const { verifyDniMock, completeActivationMock } = vi.hoisted(() => ({
  verifyDniMock: vi.fn(),
  completeActivationMock: vi.fn(),
}));

vi.mock('../../auth/activation-client', () => ({
  verifyDni: verifyDniMock,
  completeActivation: completeActivationMock,
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ActivationPage />
    </MemoryRouter>,
  );
}

async function goToCompleteStep(user: ReturnType<typeof userEvent.setup>) {
  verifyDniMock.mockResolvedValueOnce({
    eligible: true,
    memberId: '01J...',
    firstName: 'María',
    maskedEmail: 'm***@example.com',
  });
  await user.type(screen.getByRole('textbox', { name: /^dni/i }), '45678912');
  await user.click(screen.getByRole('button', { name: /verificar dni/i }));
  await screen.findByRole('heading', { name: /hola, maría/i });
}

describe('ActivationPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    verifyDniMock.mockReset();
    completeActivationMock.mockReset();
  });

  it('renderiza el formulario de verificación de forma accesible', () => {
    renderPage();

    expect(screen.getByRole('textbox', { name: /^dni/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verificar dni/i })).toBeInTheDocument();
  });

  it('valida el DNI requerido antes de verificar', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /verificar dni/i }));

    expect(await screen.findByText('El DNI debe tener 8 dígitos.')).toBeInTheDocument();
    expect(verifyDniMock).not.toHaveBeenCalled();
  });

  it('verifica el DNI elegible y muestra nombre y correo enmascarado para confirmar identidad (criterio 1)', async () => {
    const user = userEvent.setup();
    renderPage();

    await goToCompleteStep(user);

    expect(verifyDniMock).toHaveBeenCalledWith({ dni: '45678912' });
    expect(screen.getByText(/m\*\*\*@example\.com/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /correo electrónico/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^contraseña/i)).toBeInTheDocument();
  });

  it('sugiere registrarse cuando el DNI no corresponde a ningún socio migrado (criterio 2)', async () => {
    verifyDniMock.mockRejectedValueOnce(
      new ApiRequestError(404, 'DNI_NOT_FOUND', 'No existe un socio migrado con ese DNI.'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^dni/i }), '99999999');
    await user.click(screen.getByRole('button', { name: /verificar dni/i }));

    expect(
      await screen.findByText(/no encontramos un socio migrado con ese dni/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /registrarme como socio nuevo/i })).toHaveAttribute(
      'href',
      '/registro',
    );
  });

  it('sugiere iniciar sesión o recuperar contraseña cuando el DNI ya fue activado (criterio 3)', async () => {
    verifyDniMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'ALREADY_ACTIVATED', 'Este DNI ya tiene una cuenta activada.'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^dni/i }), '45678912');
    await user.click(screen.getByRole('button', { name: /verificar dni/i }));

    expect(await screen.findByText(/ya tiene una cuenta digital activada/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^iniciar sesión$/i })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: /recuperar contraseña/i })).toHaveAttribute(
      'href',
      '/recuperar-password',
    );
  });

  it('valida correo y contraseña antes de completar la activación', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    expect(await screen.findByText('Ingresa un correo electrónico válido.')).toBeInTheDocument();
    expect(screen.getByText('Debe tener al menos 8 caracteres.')).toBeInTheDocument();
    expect(completeActivationMock).not.toHaveBeenCalled();
  });

  it('completa la activación y permite iniciar sesión (criterio 4 y 8)', async () => {
    completeActivationMock.mockResolvedValueOnce({
      memberId: '01J...',
      memberStatus: 'ACTIVE',
      membershipStatus: 'ACTIVE',
    });
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'maria.quispe@example.com',
    );
    await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    expect(completeActivationMock).toHaveBeenCalledWith({
      dni: '45678912',
      email: 'maria.quispe@example.com',
      password: 'ClaveSegura1',
    });
    expect(await screen.findByRole('heading', { name: /cuenta activada/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /iniciar sesión/i })).toHaveAttribute('href', '/login');
  });

  it('advierte sobre deuda/vencimiento sin bloquear el login, dirigiendo a Pagos (caso alternativo de deuda)', async () => {
    completeActivationMock.mockResolvedValueOnce({
      memberId: '01J...',
      memberStatus: 'ACTIVE',
      membershipStatus: 'DEBT',
    });
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'maria.quispe@example.com',
    );
    await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    expect(await screen.findByRole('heading', { name: /cuenta activada/i })).toBeInTheDocument();
    expect(await screen.findByRole('status')).toHaveTextContent(
      /no podrás reservar hasta regularizar tu pago/i,
    );
  });

  it('muestra un mensaje específico cuando el correo ya está registrado (criterio 5)', async () => {
    completeActivationMock.mockRejectedValueOnce(
      new ApiRequestError(409, 'EMAIL_ALREADY_USED', 'El correo ya está registrado.'),
    );
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'maria.quispe@example.com',
    );
    await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    expect(await screen.findByText('Este correo ya está registrado.')).toBeInTheDocument();
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((alert) => /ya tiene una cuenta asociada/i.test(alert.textContent ?? '')),
    ).toBe(true);
  });

  it('muestra los errores de validación del backend campo a campo (criterio 5)', async () => {
    completeActivationMock.mockRejectedValueOnce(
      new ApiRequestError(400, 'VALIDATION_ERROR', 'Datos inválidos.', [
        { field: 'email', issue: 'El correo no es válido.' },
        { field: 'password', issue: 'La contraseña no cumple la política.' },
      ]),
    );
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.type(
      screen.getByRole('textbox', { name: /correo electrónico/i }),
      'maria.quispe@example.com',
    );
    await user.type(screen.getByLabelText(/^contraseña/i), 'ClaveSegura1');
    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    expect(await screen.findByText('El correo no es válido.')).toBeInTheDocument();
    expect(screen.getByText('La contraseña no cumple la política.')).toBeInTheDocument();
  });

  it('permite volver al paso de verificación con "usar otro DNI"', async () => {
    const user = userEvent.setup();
    renderPage();
    await goToCompleteStep(user);

    await user.click(screen.getByRole('button', { name: /no soy yo, usar otro dni/i }));

    expect(await screen.findByRole('heading', { name: /activar cuenta/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^dni/i })).toHaveValue('');
  });

  it('comunica un error genérico ante una falla inesperada al verificar', async () => {
    verifyDniMock.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByRole('textbox', { name: /^dni/i }), '45678912');
    await user.click(screen.getByRole('button', { name: /verificar dni/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo verificar el dni/i);
  });
});
