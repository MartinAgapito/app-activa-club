import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReferenceForm } from './ReferenceForm';

describe('ReferenceForm (patrón RHF + Zod de referencia)', () => {
  it('muestra errores de validación cuando se envía vacío', async () => {
    const user = userEvent.setup();
    render(<ReferenceForm />);

    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
  });

  it('acepta datos válidos y muestra la confirmación simulada', async () => {
    const user = userEvent.setup();
    render(<ReferenceForm />);

    await user.type(screen.getByLabelText(/Nombre completo/), 'María Quispe');
    await user.type(screen.getByLabelText(/Correo electrónico/), 'maria@example.com');
    await user.type(screen.getByLabelText(/Mensaje/), 'Este es un mensaje de prueba válido.');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Enviado (simulado)');
  });
});
