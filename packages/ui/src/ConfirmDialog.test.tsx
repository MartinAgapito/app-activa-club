import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('no renderiza nada cuando está cerrado', () => {
    render(
      <ConfirmDialog
        open={false}
        title="¿Aprobar solicitud?"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('muestra el título, la descripción y ejecuta la acción al confirmar', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="¿Aprobar solicitud?"
        description="Esta acción no se puede deshacer."
        confirmLabel="Aprobar"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('alertdialog', { name: '¿Aprobar solicitud?' })).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ejecuta la cancelación al cerrar con Escape o el botón cancelar', async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmDialog open title="¿Rechazar solicitud?" onConfirm={vi.fn()} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('deshabilita el botón de confirmar cuando confirmDisabled es true', () => {
    render(
      <ConfirmDialog
        open
        title="¿Rechazar solicitud?"
        confirmLabel="Rechazar"
        confirmDisabled
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeDisabled();
  });
});
