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
  neutral: 'bg-surface-raised text-ink-muted ring-1 ring-inset ring-line',
  info: 'bg-surface-brand-soft text-action',
  positive: 'bg-status-confirmed-soft text-status-confirmed',
  warning: 'bg-status-pending-soft text-status-pending',
  danger: 'bg-status-problem-soft text-status-problem',
};

export function Badge({ variant = 'neutral', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
