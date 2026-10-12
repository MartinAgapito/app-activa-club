import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VerifyEmailPage } from './VerifyEmailPage';

describe('VerifyEmailPage', () => {
  it('orienta hacia activación y registro sin prometer reenvío de código', () => {
    render(
      <MemoryRouter>
        <VerifyEmailPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Verificar correo' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'activa tu cuenta con tu DNI' })).toHaveAttribute(
      'href',
      '/activar-cuenta',
    );
    expect(screen.getByRole('link', { name: 'solicita tu registro' })).toHaveAttribute(
      'href',
      '/registro',
    );
    expect(screen.queryByText(/en construcción/i)).not.toBeInTheDocument();
  });
});
