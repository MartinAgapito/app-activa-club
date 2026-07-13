// Indicador de carga base de la design foundation de Activa Club.

import { cn } from './cn';

export interface SpinnerProps {
  /** Texto accesible para lectores de pantalla (no se muestra visualmente). */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
};

export function Spinner({ label = 'Cargando…', size = 'md', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'animate-spin rounded-full border-brand-200 border-t-brand-700',
          sizeClasses[size],
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
