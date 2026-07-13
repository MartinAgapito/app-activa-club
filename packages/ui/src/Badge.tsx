// Badge de estado de la design foundation de Activa Club.
// Uso previsto (Sprint 1+): estado de membresía, reserva, pago o socio.
// El componente es puramente visual; no decide reglas de negocio ni mapea
// valores de dominio — esa traducción (p. ej. `MembershipStatus -> variant`)
// corresponde a cada pantalla cuando se implemente.

import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-brand-100 text-brand-800',
  positive: 'bg-positive-100 text-positive-800',
  warning: 'bg-warning-100 text-warning-900',
  danger: 'bg-danger-100 text-danger-800',
};

export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
