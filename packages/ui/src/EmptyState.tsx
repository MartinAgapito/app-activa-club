// Estado "vacío" base de la design foundation de Activa Club.
// Reutilizable por cualquier pantalla que liste datos (reservas, socios,
// notificaciones, etc.) cuando la respuesta no tiene elementos, y también por
// las pantallas "en construcción" del Sprint 0.

import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      {icon ? (
        <div className="text-slate-400" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
