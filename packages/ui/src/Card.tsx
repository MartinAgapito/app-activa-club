// Contenedor de tarjeta base de la design foundation de Activa Club.

import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Reduce el padding interno para tarjetas compactas (p. ej. listados). */
  compact?: boolean;
}

export function Card({ compact = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface-card text-ink shadow-card',
        compact ? 'p-4' : 'p-6',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="type-card-title text-ink">{title}</h3>
        {description ? <p className="mt-1 type-aux text-ink-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
