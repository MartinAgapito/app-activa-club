import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Drawer, type DrawerProps } from './Drawer';

function Harness(props: Partial<DrawerProps> & { withControls?: boolean }) {
  const { withControls = true, ...rest } = props;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Detalle de la reserva"
        description="Revisa los datos."
        footer={<button onClick={() => setOpen(false)}>Aceptar</button>}
        {...rest}
      >
        {withControls ? <input aria-label="Nota" /> : <p>Solo texto</p>}
      </Drawer>
    </>
  );
}

describe('Drawer', () => {
  it('expone role dialog, aria-modal y asocia título y descripción', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialog = screen.getByRole('dialog', { name: 'Detalle de la reserva' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Revisa los datos.');
  });

  it('no deja aria-describedby colgante sin descripción', async () => {
    const user = userEvent.setup();
    render(<Harness description={undefined} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby');
  });

  it('usa identificadores únicos para dos paneles a la vez', () => {
    render(
      <>
        <Drawer open onOpenChange={vi.fn()} title="Uno">
          a
        </Drawer>
        <Drawer open onOpenChange={vi.fn()} title="Dos" side="left">
          b
        </Drawer>
      </>,
    );
    const ids = screen
      .getAllByRole('dialog', { hidden: true })
      .map((d) => d.getAttribute('aria-labelledby'));
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('abre por la derecha por defecto y por la izquierda con side="left"', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-drawer-side', 'right');
    unmount();
    render(<Harness side="left" />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-drawer-side', 'left');
  });

  it('enfoca el primer control, o el título si no hay controles', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('textbox', { name: 'Nota' })).toHaveFocus();
    unmount();
    render(<Harness withControls={false} footer={undefined} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('heading', { name: 'Detalle de la reserva' })).toHaveFocus();
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

  it('devuelve el foco al control que lo abrió al cerrar con Escape', async () => {
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

  it('cierra con clic fuera por defecto y no si closeOnOverlayClick=false', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(document.querySelector('[data-drawer-overlay]') as HTMLElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();

    render(<Harness closeOnOverlayClick={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(document.querySelector('[data-drawer-overlay]') as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('con dismissible=false ignora Escape y clic fuera, y deshabilita la X', async () => {
    const user = userEvent.setup();
    render(<Harness dismissible={false} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.keyboard('{Escape}');
    await user.click(document.querySelector('[data-drawer-overlay]') as HTMLElement);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar' })).toBeDisabled();
  });

  it('marca el body con data-scroll-locked (el aviso toast se eleva con ese atributo)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(document.body).toHaveAttribute('data-scroll-locked');
  });

  it('renderiza el pie fijo solo si se indica footer', async () => {
    const user = userEvent.setup();
    render(<Harness footer={undefined} />);
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.queryByRole('button', { name: 'Aceptar' })).not.toBeInTheDocument();
  });
});
