import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal, type ModalProps } from './Modal';
import { ConfirmDialog } from './ConfirmDialog';

function Harness(props: Partial<ModalProps> & { withControls?: boolean }) {
  const { withControls = true, ...rest } = props;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Editar instalación"
        description="Cambia los datos."
        footer={<button onClick={() => setOpen(false)}>Guardar</button>}
        {...rest}
      >
        {withControls ? <input aria-label="Nombre" /> : <p>Solo texto</p>}
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('expone role dialog, aria-modal y asocia título y descripción', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Editar instalación' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Cambia los datos.');
  });

  it('usa identificadores únicos para dos ventanas a la vez', () => {
    render(
      <>
        <Modal open onOpenChange={vi.fn()} title="Uno">
          a
        </Modal>
        <Modal open onOpenChange={vi.fn()} title="Dos">
          b
        </Modal>
      </>,
    );
    const ids = screen
      .getAllByRole('dialog', { hidden: true })
      .map((d) => d.getAttribute('aria-labelledby'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('enfoca el primer control del contenido al abrir', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveFocus();
  });

  it('enfoca el título si el contenido no tiene controles', async () => {
    const user = userEvent.setup();
    render(<Harness withControls={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('heading', { name: 'Editar instalación' })).toHaveFocus();
  });

  it('atrapa el foco con Tab y Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog');
    for (let i = 0; i < 6; i++) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('devuelve el foco al control que la abrió al cerrar con Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('cierra con el botón Cerrar', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no cierra con clic fuera por defecto, pero sí si se permite', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(document.querySelector('[data-modal-overlay]') as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    unmount();

    render(<Harness closeOnOverlayClick />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(document.querySelector('[data-modal-overlay]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('con dismissible=false ignora Escape y deshabilita la X', async () => {
    const user = userEvent.setup();
    render(<Harness dismissible={false} closeOnOverlayClick />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
  });
});

describe('ConfirmDialog sobre Modal', () => {
  it('mantiene alertdialog y devuelve el foco al cerrarse', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Rechazar</button>
          <ConfirmDialog
            open={open}
            title="¿Rechazar?"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }
    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Rechazar' });
    await user.click(trigger);
    expect(screen.getByRole('alertdialog', { name: '¿Rechazar?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
