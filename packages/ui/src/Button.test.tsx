import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';

describe('Button', () => {
  it('renderiza el contenido y responde al click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Guardar</Button>);

    const button = screen.getByRole('button', { name: 'Guardar' });
    await user.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('se deshabilita y marca aria-busy cuando isLoading es true', () => {
    render(<Button isLoading>Enviando</Button>);

    const button = screen.getByRole('button', { name: 'Enviando' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
