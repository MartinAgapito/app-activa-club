import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function Demo(props: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
  disableMiddle?: boolean;
}) {
  const { disableMiddle, ...rootProps } = props;
  return (
    <Tabs {...rootProps}>
      <TabsList aria-label="Reservas">
        <TabsTrigger value="a" count={3}>
          Proximas
        </TabsTrigger>
        <TabsTrigger value="b" disabled={disableMiddle}>
          Pasadas
        </TabsTrigger>
        <TabsTrigger value="c">Todas</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
      <TabsContent value="c">Panel C</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('expone roles WAI-ARIA y muestra solo el panel activo', () => {
    render(<Demo defaultValue="a" />);
    expect(screen.getByRole('tablist', { name: 'Reservas' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Panel A');
    expect(tabs[0]).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('aria-labelledby', tabs[0]!.id);
    expect(screen.queryByText('Panel B')).not.toBeInTheDocument();
  });

  it('muestra el contador como parte de la pestaña', () => {
    render(<Demo defaultValue="a" />);
    expect(screen.getByRole('tab', { name: /Proximas\s*3/ })).toBeInTheDocument();
  });

  it('solo la pestaña activa esta en el orden de Tab', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button>Antes</button>
        <Demo defaultValue="b" />
        <button>Despues</button>
      </>,
    );
    const [a, b, c] = screen.getAllByRole('tab');
    await user.tab();
    await user.tab();
    expect(b).toHaveFocus();
    expect(a).toHaveAttribute('tabindex', '-1');
    expect(b).toHaveAttribute('tabindex', '0');
    expect(c).toHaveAttribute('tabindex', '-1');
    // El panel activo es el siguiente elemento enfocable; las otras pestañas se saltan.
    await user.tab();
    expect(screen.getByRole('tabpanel')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Despues' })).toHaveFocus();
  });

  it('navega con flechas, Inicio y Fin con vuelta al inicio', async () => {
    const user = userEvent.setup();
    render(<Demo defaultValue="a" />);
    const [a, b, c] = screen.getAllByRole('tab');
    a!.focus();
    await user.keyboard('{ArrowRight}');
    expect(b).toHaveFocus();
    expect(b).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
    await user.keyboard('{ArrowRight}');
    expect(c).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(a).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(c).toHaveFocus();
    await user.keyboard('{Home}');
    expect(a).toHaveFocus();
    await user.keyboard('{End}');
    expect(c).toHaveFocus();
    expect(c).toHaveAttribute('aria-selected', 'true');
  });

  it('omite las pestañas deshabilitadas al navegar y no las activa con clic', async () => {
    const user = userEvent.setup();
    render(<Demo defaultValue="a" disableMiddle />);
    const [a, b, c] = screen.getAllByRole('tab');
    expect(b).toBeDisabled();
    await user.click(b!);
    expect(a).toHaveAttribute('aria-selected', 'true');
    a!.focus();
    await user.keyboard('{ArrowRight}');
    expect(c).toHaveFocus();
  });

  it('funciona controlado: respeta value y notifica onValueChange', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Demo value="a" onValueChange={onValueChange} />);
    await user.click(screen.getByRole('tab', { name: 'Todas' }));
    expect(onValueChange).toHaveBeenCalledWith('c');
    // Sin que el llamador actualice value, la pestaña activa no cambia.
    expect(screen.getByRole('tab', { name: /Proximas/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('refleja un estado externo (p. ej. search param) al cambiar value', async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [tab, setTab] = useState('b');
      return (
        <>
          <Demo value={tab} onValueChange={setTab} />
          <button onClick={() => setTab('c')}>Externo</button>
        </>
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel B');
    await user.click(screen.getByRole('button', { name: 'Externo' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Panel C');
  });
});
