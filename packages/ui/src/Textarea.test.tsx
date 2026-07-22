import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('asocia el label con el campo', () => {
    render(<Textarea label="Motivo del rechazo" />);
    expect(screen.getByLabelText('Motivo del rechazo')).toBeInTheDocument();
  });

  it('expone el mensaje de error como alert accesible y marca aria-invalid', () => {
    render(<Textarea label="Motivo del rechazo" errorMessage="El motivo es obligatorio." />);

    const textarea = screen.getByLabelText('Motivo del rechazo');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('El motivo es obligatorio.');
  });
});
