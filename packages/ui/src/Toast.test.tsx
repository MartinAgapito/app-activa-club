import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast, type ToastApi } from './Toast';

let api: ToastApi;

function Capture() {
  const toastApi = useToast();
  useEffect(() => {
    api = toastApi;
  }, [toastApi]);
  return <button type="button">Control en uso</button>;
}

function setup() {
  render(
    <ToastProvider>
      <Capture />
    </ToastProvider>,
  );
}

function fire(callback: () => void) {
  act(() => {
    callback();
  });
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra el aviso de éxito con role="status", icono oculto y texto', () => {
    setup();
    fire(() => api.success('Reserva confirmada'));

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Reserva confirmada');
    expect(toast.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('se cierra solo a los 5 segundos', () => {
    setup();
    fire(() => api.success('Bloqueo liberado'));

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('el error usa role="alert" y permanece hasta que se cierra', () => {
    setup();
    fire(() => api.error('No se pudo reservar'));

    act(() => {
      vi.advanceTimersByTime(60000);
    });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No se pudo reservar');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('información y alerta usan role="status"', () => {
    setup();
    fire(() => {
      api.info('Cambios guardados en borrador');
      api.warning('Tu membresía vence pronto');
    });

    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('pausa el tiempo mientras el puntero está encima y reanuda al salir', () => {
    setup();
    fire(() => api.success('Solicitud aprobada'));
    const toast = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('pausa el tiempo mientras el aviso tiene el foco', () => {
    setup();
    fire(() => api.success('Perfil actualizado', { action: { label: 'Ver', onClick: vi.fn() } }));

    const action = screen.getByRole('button', { name: 'Ver' });
    fireEvent.focus(action);
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.blur(action);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('muestra como máximo tres avisos y descarta el más antiguo', () => {
    setup();
    fire(() => {
      api.info('Aviso 1');
      api.info('Aviso 2');
      api.info('Aviso 3');
      api.info('Aviso 4');
    });

    expect(screen.getAllByRole('status')).toHaveLength(3);
    expect(screen.queryByText(/Aviso 1/)).not.toBeInTheDocument();
    expect(screen.getByText(/Aviso 4/)).toBeInTheDocument();
  });

  it('ejecuta la acción opcional y cierra el aviso', () => {
    const onClick = vi.fn();
    setup();
    fire(() =>
      api.success('Reserva confirmada', { action: { label: 'Ver en Mis reservas', onClick } }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver en Mis reservas' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('no roba el foco del control en uso', () => {
    setup();
    const control = screen.getByRole('button', { name: 'Control en uso' });
    control.focus();

    fire(() => api.success('Reserva confirmada'));
    expect(control).toHaveFocus();
  });

  it('un id repetido reemplaza al aviso anterior', () => {
    setup();
    fire(() => {
      api.info('Guardando...', { id: 'guardado' });
      api.success('Guardado', { id: 'guardado' });
    });

    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
  });

  it('las regiones live son cortés para éxito/info y asertiva para errores', () => {
    setup();
    fire(() => {
      api.success('Hecho');
      api.error('Falló');
    });

    expect(screen.getByRole('status').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(screen.getByRole('alert').closest('[aria-live]')).toHaveAttribute(
      'aria-live',
      'assertive',
    );
  });

  it('useToast fuera del proveedor lanza un error claro', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Capture />)).toThrow(/ToastProvider/);
    spy.mockRestore();
  });
});
