import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthAlert, PasswordRequirements } from './AuthFeedback';
import { AuthShell } from './AuthShell';

describe('AuthShell', () => {
  it('muestra el panel de marca y un único h1 con el título', () => {
    render(
      <AuthShell title="Iniciar sesión" description="Descripción de prueba">
        <button type="button">Acción</button>
      </AuthShell>,
    );

    expect(screen.getByRole('complementary', { name: /sobre activa club/i })).toHaveTextContent(
      'Activa Club',
    );
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('Iniciar sesión');
    expect(screen.getByText('Descripción de prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
  });

  it('renderiza el pie y el elemento previo al título cuando se proveen', () => {
    render(
      <AuthShell title="Título" eyebrow={<span>Etiqueta</span>} footer={<a href="/x">Enlace</a>} />,
    );

    expect(screen.getByText('Etiqueta')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enlace' })).toBeInTheDocument();
  });

  it('limita el ancho de la tarjeta de formulario a 420 px (26.25rem)', () => {
    render(<AuthShell title="Título" />);

    const section = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(section?.className).toContain('max-w-[26.25rem]');
  });
});

describe('AuthAlert', () => {
  it('anuncia los errores con role alert y el resto con role status', () => {
    render(
      <>
        <AuthAlert tone="error">Falló</AuthAlert>
        <AuthAlert tone="success">Listo</AuthAlert>
        <AuthAlert tone="info">Dato</AuthAlert>
        <AuthAlert tone="warning">Ojo</AuthAlert>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falló');
    expect(screen.getAllByRole('status')).toHaveLength(3);
  });

  it('no depende solo del color: incluye un icono oculto a lectores de pantalla y texto', () => {
    render(<AuthAlert tone="error">Falló</AuthAlert>);

    const alert = screen.getByRole('alert');
    expect(alert.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(alert).toHaveTextContent('Falló');
  });
});

describe('PasswordRequirements', () => {
  it('lista los requisitos recibidos', () => {
    render(<PasswordRequirements requirements={['Mínimo 8 caracteres', 'Una mayúscula']} />);

    expect(screen.getByText('Tu contraseña debe tener:')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
