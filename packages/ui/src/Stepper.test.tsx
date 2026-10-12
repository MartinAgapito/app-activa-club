import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Stepper } from './Stepper';

const steps = [
  { label: 'Instalación' },
  { label: 'Día y franja' },
  { label: 'Participantes' },
  { label: 'Confirmar' },
];

describe('Stepper', () => {
  it('es una lista ordenada con un item por paso', () => {
    render(<Stepper steps={steps} currentStep={1} />);
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
  });

  it('marca solo el paso actual con aria-current="step"', () => {
    render(<Stepper steps={steps} currentStep={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items[1]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
    expect(items[2]).not.toHaveAttribute('aria-current');
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it('expone el estado como texto accesible, no solo color', () => {
    render(<Stepper steps={steps} currentStep={1} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Instalación: completado');
    expect(items[1]).toHaveTextContent('Día y franja: paso actual');
    expect(items[2]).toHaveTextContent('Participantes: pendiente');
  });

  it('muestra número en actual/pendientes y verificado en completados', () => {
    render(<Stepper steps={steps} currentStep={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]!.querySelector('svg')).not.toBeNull();
    expect(items[2]).toHaveTextContent('3');
    expect(items[3]).toHaveTextContent('4');
  });

  it('muestra la forma compacta "Paso 2 de 4: Día y franja"', () => {
    render(<Stepper steps={steps} currentStep={1} />);
    expect(screen.getByText('Paso 2 de 4: Día y franja')).toBeInTheDocument();
  });

  it('un paso completado es clicable si hay onStepClick', () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={steps} currentStep={2} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByRole('button', { name: /Instalación/ }));
    expect(onStepClick).toHaveBeenCalledWith(0);
  });

  it('los pasos actual y pendientes no son clicables', () => {
    const onStepClick = vi.fn();
    render(<Stepper steps={steps} currentStep={1} onStepClick={onStepClick} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByText('Participantes'));
    fireEvent.click(screen.getByText('Confirmar'));
    expect(onStepClick).not.toHaveBeenCalled();
  });

  it('sin onStepClick no hay botones', () => {
    render(<Stepper steps={steps} currentStep={3} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('acota un índice fuera de rango', () => {
    render(<Stepper steps={steps} currentStep={99} />);
    expect(screen.getByText('Paso 4 de 4: Confirmar')).toBeInTheDocument();
  });
});
