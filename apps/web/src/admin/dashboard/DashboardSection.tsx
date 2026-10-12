// Contenedor común de los bloques del inicio del administrador (US-071):
// una sección con título accesible y acción opcional.

import { useId, type ReactNode } from 'react';
import { cn } from '@activa-club/ui';

interface DashboardSectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DashboardSection({
  title,
  description,
  action,
  children,
  className,
}: DashboardSectionProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        'rounded-card border border-line bg-surface-card p-4 text-ink shadow-card sm:p-6',
        className,
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={titleId} className="type-section-title text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 type-aux text-ink-muted">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
