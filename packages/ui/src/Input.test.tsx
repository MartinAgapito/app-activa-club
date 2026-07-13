import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('asocia el label con el campo', () => {
    render(<Input label="Correo electrónico" />);
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
  });

  it('expone el mensaje de error como alert accesible y marca aria-invalid', () => {
    render(<Input label="DNI" errorMessage="El DNI debe tener 8 dígitos." />);

    const input = screen.getByLabelText('DNI');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('El DNI debe tener 8 dígitos.');
  });
});
